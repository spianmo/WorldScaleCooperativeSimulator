use crate::llm::{LlmIntentResult, LlmPlannedTask};
use crate::models::*;
use anyhow::{anyhow, Result};
use chrono::Utc;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::time::Duration;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct OsmStreetDataset {
    pub center_lat: f64,
    pub center_lon: f64,
    pub display_name: String,
    pub features: Vec<OsmWorldFeature>,
}

#[derive(Debug, Clone)]
pub struct OsmWorldFeature {
    pub name: String,
    pub kind: WorldObjectKind,
    pub position: Vector3,
    pub size: Vector3,
    pub tags: Vec<String>,
    pub walkable: bool,
    pub interactive: bool,
    pub properties: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct NominatimPlace {
    lat: String,
    lon: String,
    display_name: String,
}

#[derive(Debug, Deserialize)]
struct OverpassResponse {
    elements: Vec<OverpassElement>,
}

#[derive(Debug, Deserialize)]
struct OverpassElement {
    id: i64,
    #[serde(rename = "type")]
    element_type: String,
    #[serde(default)]
    lat: Option<f64>,
    #[serde(default)]
    lon: Option<f64>,
    #[serde(default)]
    tags: BTreeMap<String, String>,
    #[serde(default)]
    geometry: Vec<OsmPoint>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
struct OsmPoint {
    lat: f64,
    lon: f64,
}

fn now() -> chrono::DateTime<Utc> {
    Utc::now()
}

fn sanitize_battery(value: f32, max: f32) -> f32 {
    value.max(0.0).min(max.max(1.0))
}

fn push_log(
    state: &mut SimulationState,
    level: LogLevel,
    scope: &str,
    message: impl Into<String>,
    entity_id: Option<Uuid>,
) {
    state.world.logs.push(LogEntry {
        id: Uuid::new_v4(),
        timestamp: now(),
        level,
        scope: scope.to_string(),
        message: message.into(),
        entity_id,
        context: BTreeMap::new(),
    });
}

fn device_kind_capabilities(kind: DeviceKind) -> Vec<String> {
    match kind {
        DeviceKind::Rover => vec!["ground_move".into(), "inspect".into(), "transport".into()],
        DeviceKind::Drone => vec!["aerial_move".into(), "photo".into(), "search".into()],
        DeviceKind::Humanoid => vec!["ground_move".into(), "inspect".into(), "delivery".into()],
        DeviceKind::Quadruped => vec![
            "ground_move".into(),
            "inspect".into(),
            "rough_terrain".into(),
        ],
        DeviceKind::UnitreeRobot => vec![
            "ground_move".into(),
            "inspect".into(),
            "rough_terrain".into(),
            "payload".into(),
        ],
        DeviceKind::SensorHub => vec!["sense".into(), "report".into()],
        DeviceKind::ChargingBase => vec!["charge".into()],
    }
}

fn default_physical_profile(kind: DeviceKind, rules: &PhysicalRules) -> DevicePhysicalProfile {
    match kind {
        DeviceKind::Drone => DevicePhysicalProfile {
            min_work_altitude_m: rules.drone_min_altitude_m,
            max_work_altitude_m: rules.drone_max_altitude_m,
            max_slope_deg: 90.0,
            supported_materials: vec!["air".into()],
            nominal_power_w: 36.0,
            working_power_w: 180.0,
            max_speed_mps: 12.0,
            joint_count: 4,
        },
        DeviceKind::Humanoid => DevicePhysicalProfile {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 2.4,
            max_slope_deg: rules.humanoid_max_slope_deg,
            supported_materials: rules.ground_allowed_materials.clone(),
            nominal_power_w: 42.0,
            working_power_w: 260.0,
            max_speed_mps: 1.4,
            joint_count: 24,
        },
        DeviceKind::Quadruped => DevicePhysicalProfile {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 1.4,
            max_slope_deg: rules.quadruped_max_slope_deg,
            supported_materials: rules.ground_allowed_materials.clone(),
            nominal_power_w: 30.0,
            working_power_w: 180.0,
            max_speed_mps: 2.2,
            joint_count: 12,
        },
        DeviceKind::UnitreeRobot => DevicePhysicalProfile {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 1.4,
            max_slope_deg: rules.quadruped_max_slope_deg,
            supported_materials: rules.ground_allowed_materials.clone(),
            nominal_power_w: 32.0,
            working_power_w: 200.0,
            max_speed_mps: 2.4,
            joint_count: 12,
        },
        DeviceKind::SensorHub => DevicePhysicalProfile {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 4.0,
            max_slope_deg: 8.0,
            supported_materials: rules.ground_allowed_materials.clone(),
            nominal_power_w: 6.0,
            working_power_w: 14.0,
            max_speed_mps: 0.0,
            joint_count: 0,
        },
        DeviceKind::ChargingBase => DevicePhysicalProfile {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 0.2,
            max_slope_deg: 3.0,
            supported_materials: vec!["concrete".into(), "asphalt".into()],
            nominal_power_w: 18.0,
            working_power_w: 22.0,
            max_speed_mps: 0.0,
            joint_count: 0,
        },
        DeviceKind::Rover => DevicePhysicalProfile {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 1.2,
            max_slope_deg: rules.rover_max_slope_deg,
            supported_materials: rules.ground_allowed_materials.clone(),
            nominal_power_w: 18.0,
            working_power_w: 90.0,
            max_speed_mps: 2.0,
            joint_count: 4,
        },
    }
}

fn default_device_name(kind: DeviceKind, index: usize) -> String {
    let prefix = match kind {
        DeviceKind::Rover => "地面设备",
        DeviceKind::Drone => "无人机",
        DeviceKind::Humanoid => "人形机器人",
        DeviceKind::Quadruped => "四足机器狗",
        DeviceKind::UnitreeRobot => "宇树机器人",
        DeviceKind::SensorHub => "传感器节点",
        DeviceKind::ChargingBase => "充电基站",
    };
    format!("{}-{}", prefix, index + 1)
}

fn climate_motion_scale(climate: Climate, kind: DeviceKind) -> f32 {
    match climate {
        Climate::Stormy => {
            if kind == DeviceKind::Drone {
                0.42
            } else {
                0.55
            }
        }
        Climate::Rainy => {
            if kind == DeviceKind::Drone {
                0.78
            } else {
                0.72
            }
        }
        Climate::Foggy => 0.86,
        Climate::Windy => {
            if kind == DeviceKind::Drone {
                0.68
            } else {
                0.94
            }
        }
        Climate::Cloudy | Climate::Clear => 1.0,
    }
}

fn climate_wind_mps(climate: Climate) -> f32 {
    match climate {
        Climate::Stormy => 16.0,
        Climate::Windy => 11.0,
        Climate::Rainy => 6.0,
        Climate::Cloudy => 4.0,
        Climate::Foggy => 2.0,
        Climate::Clear => 1.5,
    }
}

fn lon_lat_to_world(
    lon: f64,
    lat: f64,
    center_lon: f64,
    center_lat: f64,
    size: Vector3,
    radius_m: f32,
) -> (f32, f32) {
    let meters_per_lat = 111_320.0;
    let meters_per_lon = (center_lat.to_radians().cos().abs().max(0.2)) * 111_320.0;
    let dx_m = (lon - center_lon) * meters_per_lon;
    let dz_m = (lat - center_lat) * meters_per_lat;
    let scale_x = size.x as f64 / (radius_m as f64 * 2.0);
    let scale_z = size.z as f64 / (radius_m as f64 * 2.0);
    let x = (size.x as f64 / 2.0 + dx_m * scale_x).clamp(0.0, size.x as f64);
    let z = (size.z as f64 / 2.0 - dz_m * scale_z).clamp(0.0, size.z as f64);
    (x as f32, z as f32)
}

fn add_world_metadata_object(
    world: &mut World,
    street_address: &str,
    district: &str,
    center_lat: f64,
    center_lon: f64,
    radius_m: f32,
    data_source: &str,
    data_status: &str,
) {
    let mut metadata = BTreeMap::new();
    metadata.insert("world_metadata".into(), "true".into());
    metadata.insert(
        "description".into(),
        format!(
            "指定街道 3D 建筑街景：{}，中心 {:.6},{:.6}，半径 {:.0}m，来源 {}。",
            street_address,
            center_lat,
            center_lon,
            radius_m,
            data_source,
        ),
    );
    metadata.insert("street_address".into(), street_address.to_string());
    metadata.insert("district".into(), district.to_string());
    metadata.insert("center_lat".into(), format!("{center_lat:.6}"));
    metadata.insert("center_lon".into(), format!("{center_lon:.6}"));
    metadata.insert("radius_m".into(), format!("{radius_m:.0}"));
    metadata.insert("data_source".into(), data_source.to_string());
    metadata.insert("data_status".into(), data_status.to_string());
    metadata.insert(
        "license".into(),
        "OpenStreetMap contributors / ODbL".into(),
    );
    metadata.insert("created_by".into(), "TerminalLink".into());
    metadata.insert("created_at".into(), now().to_rfc3339());
    world.objects.push(WorldObject {
        id: Uuid::new_v4(),
        name: format!("{} 元数据", street_address),
        kind: WorldObjectKind::Boundary,
        position: Vector3::new(world.size.x / 2.0, 0.0, world.size.z / 2.0),
        size: Vector3::new(world.size.x, 0.05, world.size.z),
        tags: vec!["world_metadata".into(), "real_street".into(), "osm".into()],
        walkable: false,
        interactive: false,
        properties: metadata,
    });
}

fn finalize_world_metadata(world: &mut World) {
    let building_count = world
        .objects
        .iter()
        .filter(|object| {
            matches!(
                object.kind,
                WorldObjectKind::Building | WorldObjectKind::Landmark
            )
        })
        .count();
    let road_count = world
        .objects
        .iter()
        .filter(|object| object.kind == WorldObjectKind::RoadSegment)
        .count();
    if let Some(metadata_object) = world.objects.iter_mut().find(|object| {
        object
            .properties
            .get("world_metadata")
            .map(|value| value == "true")
            .unwrap_or(false)
    }) {
        metadata_object
            .properties
            .insert("building_count".into(), building_count.to_string());
        metadata_object
            .properties
            .insert("road_count".into(), road_count.to_string());
        metadata_object.properties.insert(
            "poi_count".into(),
            ((building_count / 4).max(4)).to_string(),
        );
    }
}

fn build_osm_world(
    name: String,
    seed: u64,
    size: Vector3,
    density: f32,
    street_address: &str,
    district: &str,
    radius_m: f32,
    data_source: &str,
    dataset: OsmStreetDataset,
) -> World {
    let mut world = World::new(name, seed, size);
    world.rules.world.object_density = density;
    world.rules.world.max_objects = dataset.features.len().clamp(8, 256);
    world.climate = Climate::Clear;
    world.terrain = TerrainProfile::Urban;
    add_world_metadata_object(
        &mut world,
        street_address,
        district,
        dataset.center_lat,
        dataset.center_lon,
        radius_m,
        data_source,
        "online_osm",
    );

    for feature in dataset.features {
        world.objects.push(WorldObject {
            id: Uuid::new_v4(),
            name: feature.name,
            kind: feature.kind,
            position: feature.position,
            size: feature.size,
            tags: feature.tags,
            walkable: feature.walkable,
            interactive: feature.interactive,
            properties: feature.properties,
        });
    }

    finalize_world_metadata(&mut world);
    world
}

fn osm_point_from_element(element: &OverpassElement) -> Option<OsmPoint> {
    element
        .geometry
        .first()
        .copied()
        .or_else(|| match (element.lat, element.lon) {
            (Some(lat), Some(lon)) => Some(OsmPoint { lat, lon }),
            _ => None,
        })
}

fn geometry_bbox(points: &[OsmPoint]) -> Option<(f64, f64, f64, f64)> {
    let first = points.first()?;
    let mut min_lat = first.lat;
    let mut max_lat = first.lat;
    let mut min_lon = first.lon;
    let mut max_lon = first.lon;

    for point in points {
        min_lat = min_lat.min(point.lat);
        max_lat = max_lat.max(point.lat);
        min_lon = min_lon.min(point.lon);
        max_lon = max_lon.max(point.lon);
    }

    Some((min_lat, max_lat, min_lon, max_lon))
}

fn parse_osm_height_m(tags: &BTreeMap<String, String>, fallback: f32) -> f32 {
    if let Some(height) = tags
        .get("height")
        .and_then(|value| value.trim_end_matches('m').trim().parse::<f32>().ok())
    {
        return height.clamp(3.0, 120.0);
    }

    tags.get("building:levels")
        .and_then(|value| value.parse::<f32>().ok())
        .map(|levels| (levels * 3.2).clamp(3.0, 120.0))
        .unwrap_or(fallback)
}

fn overpass_element_to_feature(
    element: OverpassElement,
    center_lat: f64,
    center_lon: f64,
    size: Vector3,
    radius_m: f32,
) -> Option<OsmWorldFeature> {
    let has_highway = element.tags.contains_key("highway");
    let has_building = element.tags.contains_key("building");
    let has_green = element.tags.contains_key("leisure")
        || element
            .tags
            .get("landuse")
            .map(|value| value == "grass" || value == "park")
            .unwrap_or(false);
    let has_water = element
        .tags
        .get("natural")
        .map(|value| value == "water")
        .unwrap_or(false);
    let has_poi = element.tags.contains_key("amenity")
        || element.tags.contains_key("shop")
        || element.tags.contains_key("tourism");

    if !(has_highway || has_building || has_green || has_water || has_poi) {
        return None;
    }

    let points = if element.geometry.is_empty() {
        vec![osm_point_from_element(&element)?]
    } else {
        element.geometry.clone()
    };
    let (min_lat, max_lat, min_lon, max_lon) = geometry_bbox(&points)?;
    let center_point = OsmPoint {
        lat: (min_lat + max_lat) / 2.0,
        lon: (min_lon + max_lon) / 2.0,
    };
    let (center_x, center_z) = lon_lat_to_world(
        center_point.lon,
        center_point.lat,
        center_lon,
        center_lat,
        size,
        radius_m,
    );
    let (min_x, min_z) = lon_lat_to_world(min_lon, max_lat, center_lon, center_lat, size, radius_m);
    let (max_x, max_z) = lon_lat_to_world(max_lon, min_lat, center_lon, center_lat, size, radius_m);
    let width = (max_x - min_x).abs().max(2.2);
    let depth = (max_z - min_z).abs().max(2.2);
    let fallback_name = if has_highway {
        "OpenStreetMap 道路"
    } else if has_building {
        "OpenStreetMap 建筑"
    } else if has_poi {
        "OpenStreetMap 兴趣点"
    } else {
        "OpenStreetMap 图层"
    };
    let name = element
        .tags
        .get("name")
        .cloned()
        .unwrap_or_else(|| format!("{} {}", fallback_name, element.id));
    let source = "openstreetmap".to_string();
    let mut properties = BTreeMap::new();
    properties.insert("source".into(), source);
    properties.insert("source_name".into(), "OpenStreetMap".into());
    properties.insert("osm_id".into(), element.id.to_string());
    properties.insert("osm_type".into(), element.element_type);
    properties.insert("lat".into(), format!("{:.6}", center_point.lat));
    properties.insert("lon".into(), format!("{:.6}", center_point.lon));
    for (key, value) in &element.tags {
        if matches!(
            key.as_str(),
            "name"
                | "highway"
                | "building"
                | "amenity"
                | "shop"
                | "tourism"
                | "landuse"
                | "leisure"
                | "natural"
                | "height"
                | "building:levels"
        ) {
            properties.insert(format!("osm_tag_{key}"), value.clone());
        }
    }

    if has_highway {
        let (rotation_y, length) = match (points.first(), points.last()) {
            (Some(first), Some(last)) => {
                let (first_x, first_z) =
                    lon_lat_to_world(first.lon, first.lat, center_lon, center_lat, size, radius_m);
                let (last_x, last_z) =
                    lon_lat_to_world(last.lon, last.lat, center_lon, center_lat, size, radius_m);
                let dx = last_x - first_x;
                let dz = last_z - first_z;
                (
                    dz.atan2(dx),
                    (dx * dx + dz * dz).sqrt().max(width.max(depth)),
                )
            }
            _ => (0.0, width.max(depth)),
        };
        properties.insert("material".into(), "asphalt".into());
        properties.insert("orientation_rad".into(), rotation_y.to_string());
        return Some(OsmWorldFeature {
            name,
            kind: WorldObjectKind::RoadSegment,
            position: Vector3::new(center_x, 0.0, center_z),
            size: Vector3::new(length.max(3.0), 0.2, 3.2),
            tags: vec!["road_segment".into(), "osm".into(), "real_street".into()],
            walkable: true,
            interactive: false,
            properties,
        });
    }

    if has_building {
        let height = parse_osm_height_m(
            &element.tags,
            14.0 + (element.id.rem_euclid(12) as f32) * 2.2,
        );
        properties.insert("material".into(), "concrete".into());
        properties.insert("height_m".into(), format!("{height:.1}"));
        return Some(OsmWorldFeature {
            name,
            kind: WorldObjectKind::Building,
            position: Vector3::new(center_x, 0.0, center_z),
            size: Vector3::new(width.max(3.0), height, depth.max(3.0)),
            tags: vec!["building".into(), "osm".into(), "real_street".into()],
            walkable: false,
            interactive: true,
            properties,
        });
    }

    properties.insert(
        "material".into(),
        if has_water { "water" } else { "grass" }.into(),
    );
    Some(OsmWorldFeature {
        name,
        kind: if has_poi {
            WorldObjectKind::Landmark
        } else if has_water {
            WorldObjectKind::Water
        } else {
            WorldObjectKind::TerrainPatch
        },
        position: Vector3::new(center_x, 0.0, center_z),
        size: Vector3::new(
            width.max(2.4),
            if has_poi { 8.0 } else { 0.2 },
            depth.max(2.4),
        ),
        tags: vec![
            "osm".into(),
            if has_poi {
                "poi".into()
            } else {
                "terrain_patch".into()
            },
        ],
        walkable: !has_water,
        interactive: true,
        properties,
    })
}

pub async fn fetch_osm_street_dataset(
    input: &GenerateWorldInput,
    size: Vector3,
    radius_m: f32,
) -> Result<OsmStreetDataset> {
    let street_address = input
        .street_address
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("解放路城市演示街区");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(18))
        .user_agent("TerminalLink-world-simulator/0.1 (OpenStreetMap attribution: https://www.openstreetmap.org/copyright)")
        .build()?;

    let (center_lat, center_lon, display_name) = match (input.center_lat, input.center_lon) {
        (Some(lat), Some(lon)) => (lat, lon, street_address.to_string()),
        _ => {
            let places = client
                .get("https://nominatim.openstreetmap.org/search")
                .query(&[("format", "jsonv2"), ("limit", "1"), ("q", street_address)])
                .send()
                .await?
                .error_for_status()?
                .json::<Vec<NominatimPlace>>()
                .await?;
            let place = places
                .into_iter()
                .next()
                .ok_or_else(|| anyhow!("Nominatim 未找到地点：{street_address}"))?;
            (
                place.lat.parse::<f64>()?,
                place.lon.parse::<f64>()?,
                place.display_name,
            )
        }
    };

    let query = format!(
        r#"
        [out:json][timeout:18];
        (
          way["highway"](around:{radius},{lat},{lon});
          way["building"](around:{radius},{lat},{lon});
          relation["building"](around:{radius},{lat},{lon});
          way["leisure"~"park|garden"](around:{radius},{lat},{lon});
          way["landuse"~"grass|park|recreation_ground"](around:{radius},{lat},{lon});
          way["natural"="water"](around:{radius},{lat},{lon});
          node["amenity"](around:{radius},{lat},{lon});
          node["shop"](around:{radius},{lat},{lon});
          node["tourism"](around:{radius},{lat},{lon});
        );
        out geom 160;
        "#,
        radius = radius_m.round(),
        lat = center_lat,
        lon = center_lon,
    );

    let response = client
        .post("https://overpass-api.de/api/interpreter")
        .body(query)
        .send()
        .await?
        .error_for_status()?
        .json::<OverpassResponse>()
        .await?;
    let mut features = response
        .elements
        .into_iter()
        .filter_map(|element| {
            overpass_element_to_feature(element, center_lat, center_lon, size, radius_m)
        })
        .take(180)
        .collect::<Vec<_>>();

    features.sort_by(|left, right| {
        let left_rank = if left.kind == WorldObjectKind::RoadSegment {
            0
        } else if left.kind == WorldObjectKind::Building {
            1
        } else {
            2
        };
        let right_rank = if right.kind == WorldObjectKind::RoadSegment {
            0
        } else if right.kind == WorldObjectKind::Building {
            1
        } else {
            2
        };
        left_rank.cmp(&right_rank)
    });

    if features
        .iter()
        .filter(|feature| feature.kind == WorldObjectKind::RoadSegment)
        .count()
        < 2
        || features
            .iter()
            .filter(|feature| feature.kind == WorldObjectKind::Building)
            .count()
            < 2
    {
        return Err(anyhow!("Overpass 返回的道路或建筑数量不足"));
    }

    Ok(OsmStreetDataset {
        center_lat,
        center_lon,
        display_name,
        features,
    })
}

pub fn update_settings(
    state: &mut SimulationState,
    patch: SettingsPatch,
) -> Result<SimulationState> {
    // 这里把设置更新收敛到单一入口，避免前端分别改 settings 和 rules 导致状态漂移。
    if let Some(value) = patch.app_name {
        state.settings.app_name = value;
    }
    if let Some(value) = patch.language {
        state.settings.language = value;
    }
    if let Some(value) = patch.theme {
        state.settings.theme = value;
    }
    if let Some(value) = patch.auto_save {
        state.settings.auto_save = value;
    }
    if let Some(value) = patch.auto_save_every_tick {
        state.settings.auto_save_every_tick = value;
    }
    if let Some(value) = patch.default_world_name {
        state.settings.default_world_name = value;
    }
    if let Some(value) = patch.default_world_seed {
        state.settings.default_world_seed = value;
    }
    if let Some(value) = patch.default_world_size {
        state.settings.default_world_size = value;
    }
    if let Some(value) = patch.default_object_density {
        state.settings.default_object_density = value;
        state.world.rules.world.object_density = value;
    }
    if let Some(value) = patch.default_device_battery {
        state.settings.default_device_battery = value;
    }
    if let Some(value) = patch.default_tick_seconds {
        state.settings.default_tick_seconds = value;
    }
    if let Some(value) = patch.max_devices {
        state.settings.max_devices = value;
    }
    if let Some(value) = patch.log_level {
        state.settings.log_level = value;
    }
    if let Some(value) = patch.terminal_log_density {
        state.settings.terminal_log_density = value;
    }
    if let Some(value) = patch.map_notes {
        state.settings.map_notes = value;
    }
    if let Some(value) = patch.battery_moving_drain_per_tick {
        state.world.rules.battery.moving_drain_per_tick = value;
    }
    if let Some(value) = patch.battery_working_drain_per_tick {
        state.world.rules.battery.working_drain_per_tick = value;
    }
    if let Some(value) = patch.battery_idle_recharge_per_tick {
        state.world.rules.battery.idle_recharge_per_tick = value;
    }
    if let Some(value) = patch.battery_charging_recharge_per_tick {
        state.world.rules.battery.charging_recharge_per_tick = value;
    }
    if let Some(value) = patch.battery_low_threshold {
        state.world.rules.battery.low_battery_threshold = value;
    }
    if let Some(value) = patch.battery_critical_threshold {
        state.world.rules.battery.critical_battery_threshold = value;
    }
    if let Some(value) = patch.task_progress_per_tick {
        state.world.rules.task_planning.task_progress_per_tick = value;
    }
    if let Some(value) = patch.fallback_task_title {
        state.world.rules.task_planning.fallback_task_title = value;
    }
    if let Some(value) = patch.world_max_objects {
        state.world.rules.world.max_objects = value;
    }
    if let Some(value) = patch.drone_min_altitude_m {
        state.world.rules.physical.drone_min_altitude_m = value;
    }
    if let Some(value) = patch.drone_max_altitude_m {
        state.world.rules.physical.drone_max_altitude_m = value;
    }
    if let Some(value) = patch.rover_max_slope_deg {
        state.world.rules.physical.rover_max_slope_deg = value;
    }
    if let Some(value) = patch.humanoid_max_slope_deg {
        state.world.rules.physical.humanoid_max_slope_deg = value;
    }
    if let Some(value) = patch.quadruped_max_slope_deg {
        state.world.rules.physical.quadruped_max_slope_deg = value;
    }
    if let Some(value) = patch.ground_allowed_materials {
        state.world.rules.physical.ground_allowed_materials = value;
    }
    if let Some(value) = patch.max_active_tasks_per_device {
        state.world.rules.dispatch.max_active_tasks_per_device = value;
    }
    if let Some(value) = patch.prefer_nearest_device {
        state.world.rules.dispatch.prefer_nearest_device = value;
    }
    if let Some(value) = patch.requeue_unfinished_tasks_on_remove {
        state
            .world
            .rules
            .dispatch
            .requeue_unfinished_tasks_on_remove = value;
    }

    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Info,
        "settings",
        "已更新设置和规则",
        Some(state.world.id),
    );
    Ok(state.clone())
}

pub async fn generate_world(
    state: &mut SimulationState,
    input: GenerateWorldInput,
) -> Result<SimulationState> {
    let seed = input.seed.unwrap_or(state.settings.default_world_seed);
    let name = input
        .name
        .clone()
        .unwrap_or_else(|| state.settings.default_world_name.clone());
    let radius_m = input.radius_m.unwrap_or(500.0).clamp(120.0, 3_000.0);
    let size = input.size.unwrap_or_else(|| {
        let side = (radius_m / 5.0).clamp(80.0, 600.0);
        Vector3::new(side, 90.0, side)
    });
    let density = input
        .object_density
        .unwrap_or(state.settings.default_object_density)
        .clamp(0.01, 1.0);
    let street_address = input
        .street_address
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("解放路城市演示街区")
        .to_string();
    let district = input
        .district
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("示范行政区")
        .to_string();
    let center_lat = input.center_lat.unwrap_or(31.2304);
    let center_lon = input.center_lon.unwrap_or(121.4737);
    let data_source = input
        .data_source
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("OpenStreetMap")
        .to_string();
    if !data_source.eq_ignore_ascii_case("OpenStreetMap") {
        return Err(anyhow!(
            "只支持在线 OpenStreetMap 3D 地图渠道，当前数据源不受支持：{data_source}"
        ));
    }
    let dataset = fetch_osm_street_dataset(&input, size, radius_m)
        .await
        .map_err(|error| anyhow!("在线 OpenStreetMap 数据拉取失败：{error}"))?;
    let display_name = dataset.display_name.clone();
    let mut world = build_osm_world(
        name.clone(),
        seed,
        size,
        density,
        &street_address,
        &district,
        radius_m,
        &data_source,
        dataset,
    );
    if let Some(metadata_object) = world.objects.iter_mut().find(|object| {
        object
            .properties
            .get("world_metadata")
            .map(|value| value == "true")
            .unwrap_or(false)
    }) {
        metadata_object
            .properties
            .insert("osm_display_name".into(), display_name);
    }

    state.world = world;
    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Info,
        "world",
        format!(
            "已创建实景世界：{}，中心 {:.6},{:.6}，半径 {:.0}m，来源 {}{}",
            street_address,
            center_lat,
            center_lon,
            radius_m,
            data_source,
            "，online_osm",
        ),
        Some(state.world.id),
    );
    Ok(state.clone())
}

pub fn register_device(
    state: &mut SimulationState,
    input: RegisterDeviceInput,
) -> Result<SimulationState> {
    if state.world.devices.len() >= state.settings.max_devices {
        return Err(anyhow!("设备数量已达到上限 {}", state.settings.max_devices));
    }

    let kind = input.kind.unwrap_or(DeviceKind::Rover);
    let mut device = Device::default();
    device.name = if input.name.trim().is_empty() {
        default_device_name(kind, state.world.devices.len())
    } else {
        input.name
    };
    device.kind = kind;
    device.battery_capacity = input.battery_capacity.unwrap_or(100.0).max(1.0);
    device.battery = sanitize_battery(
        input
            .battery
            .unwrap_or(state.settings.default_device_battery),
        device.battery_capacity,
    );
    device.position = input.position.unwrap_or_default();
    device.physical_profile = input
        .physical_profile
        .unwrap_or_else(|| default_physical_profile(kind, &state.world.rules.physical));
    device.capabilities = input
        .capabilities
        .unwrap_or_else(|| device_kind_capabilities(kind));
    device.status = if device.battery <= state.world.rules.battery.critical_battery_threshold {
        DeviceStatus::Charging
    } else {
        DeviceStatus::Idle
    };
    device.created_at = now();
    device.updated_at = device.created_at;
    device.last_tick_at = None;
    state.world.devices.push(device.clone());
    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Info,
        "device",
        format!("已注册设备 {}", device.name),
        Some(device.id),
    );
    Ok(state.clone())
}

pub fn remove_device(state: &mut SimulationState, device_id: Uuid) -> Result<SimulationState> {
    let pos = state
        .world
        .devices
        .iter()
        .position(|device| device.id == device_id)
        .ok_or_else(|| anyhow!("未找到设备 {}", device_id))?;

    let removed = state.world.devices.remove(pos);
    if state
        .world
        .rules
        .dispatch
        .requeue_unfinished_tasks_on_remove
    {
        for task in state.world.tasks.iter_mut().filter(|task| {
            task.assignee_device_id == Some(device_id) && task.status != TaskStatus::Done
        }) {
            task.assignee_device_id = None;
            task.status = TaskStatus::Pending;
            task.updated_at = now();
        }
    } else {
        for task in state
            .world
            .tasks
            .iter_mut()
            .filter(|task| task.assignee_device_id == Some(device_id))
        {
            task.assignee_device_id = None;
            task.updated_at = now();
        }
    }
    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Warn,
        "device",
        format!("已移除设备 {}", removed.name),
        Some(device_id),
    );
    Ok(state.clone())
}

fn capability_matches(device: &Device, required_capabilities: &[String]) -> bool {
    if required_capabilities.is_empty() {
        return true;
    }

    required_capabilities.iter().all(|required| {
        let required = required.trim();
        !required.is_empty()
            && device.capabilities.iter().any(|capability| {
                capability.eq_ignore_ascii_case(required)
                    || capability.to_lowercase().contains(&required.to_lowercase())
            })
    })
}

fn available_device_ids(
    state: &SimulationState,
    preferred: Option<DeviceKind>,
    required_capabilities: &[String],
    planned_counts: &BTreeMap<Uuid, usize>,
) -> Vec<Uuid> {
    let base = state
        .world
        .devices
        .iter()
        .filter(|device| {
            device.active && device.status != DeviceStatus::Offline && device.battery > 0.0
        })
        .filter(|device| {
            let planned_count = planned_counts.get(&device.id).copied().unwrap_or(0);
            device.assigned_task_ids.len() + planned_count
                < state.world.rules.dispatch.max_active_tasks_per_device
        })
        .collect::<Vec<_>>();

    let mut candidates = base
        .iter()
        .copied()
        .filter(|device| preferred.map_or(true, |kind| device.kind == kind))
        .filter(|device| capability_matches(device, required_capabilities))
        .collect::<Vec<_>>();

    if candidates.is_empty() && preferred.is_some() {
        candidates = base
            .iter()
            .copied()
            .filter(|device| capability_matches(device, required_capabilities))
            .collect::<Vec<_>>();
    }

    if candidates.is_empty() && !required_capabilities.is_empty() {
        candidates = base
            .iter()
            .copied()
            .filter(|device| preferred.map_or(true, |kind| device.kind == kind))
            .collect::<Vec<_>>();
    }

    if candidates.is_empty() {
        candidates = base;
    }

    candidates.sort_by(|left, right| {
        let left_count =
            left.assigned_task_ids.len() + planned_counts.get(&left.id).copied().unwrap_or(0);
        let right_count =
            right.assigned_task_ids.len() + planned_counts.get(&right.id).copied().unwrap_or(0);
        let active_order = left_count.cmp(&right_count);
        if active_order != std::cmp::Ordering::Equal {
            return active_order;
        }

        if state.world.rules.dispatch.prefer_nearest_device {
            let left_score = left.position.x.abs() + left.position.y.abs() + left.position.z.abs();
            let right_score =
                right.position.x.abs() + right.position.y.abs() + right.position.z.abs();
            return left_score.total_cmp(&right_score);
        }

        right.battery.total_cmp(&left.battery)
    });

    candidates.into_iter().map(|device| device.id).collect()
}

fn planned_task_specs(plan: &LlmIntentResult) -> Vec<LlmPlannedTask> {
    if !plan.tasks.is_empty() {
        let tasks = plan
            .tasks
            .iter()
            .filter(|task| !task.title.trim().is_empty())
            .map(|task| LlmPlannedTask {
                title: task.title.trim().to_string(),
                description: task.description.clone(),
                preferred_device_kind: task.preferred_device_kind,
                required_capabilities: task.required_capabilities.clone(),
                priority: task.priority,
                estimated_ticks: task.estimated_ticks,
            })
            .collect::<Vec<_>>();
        if !tasks.is_empty() {
            return tasks;
        }
    }

    plan.task_titles
        .iter()
        .filter(|title| !title.trim().is_empty())
        .map(|title| LlmPlannedTask {
            title: title.trim().to_string(),
            description: None,
            preferred_device_kind: None,
            required_capabilities: Vec::new(),
            priority: None,
            estimated_ticks: None,
        })
        .collect()
}

fn create_blocked_planning_task(goal: &Goal, reason: &str) -> Task {
    let now = now();
    Task {
        id: Uuid::new_v4(),
        goal_id: goal.id,
        title: "等待中枢 LLM agents 规划".to_string(),
        description: format!(
            "AR 眼镜目标已进入中枢网关，但尚未获得大模型 agents 规划结果：{reason}"
        ),
        keywords: vec!["llm_agents".into(), "gateway_pending".into()],
        status: TaskStatus::Blocked,
        priority: goal.priority,
        estimated_ticks: 1,
        progress: 0.0,
        assignee_device_id: None,
        related_object_ids: Vec::new(),
        created_at: now,
        updated_at: now,
        completed_at: None,
    }
}

pub fn submit_goal(
    state: &mut SimulationState,
    input: SubmitGoalInput,
    llm_plan: Option<LlmIntentResult>,
    planner_error: Option<String>,
) -> Result<SimulationState> {
    let requested_by = input.requested_by.unwrap_or_else(|| "unknown".to_string());
    let description = input.description.unwrap_or_default();
    let fallback_priority = input
        .priority
        .unwrap_or(state.world.rules.task_planning.default_priority)
        .clamp(1, 10);
    let priority = llm_plan
        .as_ref()
        .map(|plan| plan.priority.clamp(1, 10))
        .unwrap_or(fallback_priority);

    let mut goal = Goal::default();
    goal.title = input.title;
    goal.description = description.clone();
    goal.requested_by = requested_by;
    goal.keywords = input
        .keywords
        .unwrap_or_else(|| vec!["ar_glasses".into(), "llm_agents".into()]);
    goal.status = if llm_plan.is_some() {
        GoalStatus::Active
    } else {
        GoalStatus::Blocked
    };
    goal.priority = priority;
    goal.created_at = now();
    goal.updated_at = goal.created_at;

    if priority >= 9 {
        interrupt_active_work(state, &goal);
    }

    let mut task_templates: Vec<Task> = Vec::new();

    if let Some(plan) = llm_plan {
        let specs = planned_task_specs(&plan);
        if specs.is_empty() {
            goal.status = GoalStatus::Blocked;
            task_templates.push(create_blocked_planning_task(
                &goal,
                "LLM agents 返回了空任务列表",
            ));
        } else {
            // 中枢网关只消费 LLM agents 给出的协同计划；这里不再按本地关键词拆任务。
            let mut planned_counts: BTreeMap<Uuid, usize> = BTreeMap::new();
            for spec in specs {
                let now = now();
                let required_capabilities = spec
                    .required_capabilities
                    .iter()
                    .map(|capability| capability.trim().to_string())
                    .filter(|capability| !capability.is_empty())
                    .collect::<Vec<_>>();
                let assignee = available_device_ids(
                    state,
                    spec.preferred_device_kind,
                    &required_capabilities,
                    &planned_counts,
                )
                .into_iter()
                .next();
                if let Some(device_id) = assignee {
                    *planned_counts.entry(device_id).or_insert(0) += 1;
                }
                task_templates.push(Task {
                    id: Uuid::new_v4(),
                    goal_id: goal.id,
                    title: spec.title,
                    description: spec.description.unwrap_or_else(|| {
                        if description.is_empty() {
                            "由中枢 LLM agents 协同规划并下发执行".to_string()
                        } else {
                            description.clone()
                        }
                    }),
                    keywords: if required_capabilities.is_empty() {
                        vec!["llm_agents".into(), "gateway_dispatch".into()]
                    } else {
                        required_capabilities.clone()
                    },
                    status: if assignee.is_some() {
                        TaskStatus::InProgress
                    } else {
                        TaskStatus::Pending
                    },
                    priority: spec.priority.unwrap_or(priority).clamp(1, 10),
                    estimated_ticks: spec.estimated_ticks.unwrap_or(4).max(1),
                    progress: if assignee.is_some() { 0.04 } else { 0.0 },
                    assignee_device_id: assignee,
                    related_object_ids: Vec::new(),
                    created_at: now,
                    updated_at: now,
                    completed_at: None,
                });
            }
        }
    } else {
        let reason = planner_error.unwrap_or_else(|| "LLM agents 未配置".to_string());
        task_templates.push(create_blocked_planning_task(&goal, &reason));
        push_log(
            state,
            LogLevel::Warn,
            "gateway",
            format!("中枢 LLM agents 未完成规划：{reason}"),
            Some(goal.id),
        );
    }

    goal.task_ids = task_templates.iter().map(|task| task.id).collect();
    state.world.goals.push(goal.clone());
    state.world.tasks.extend(task_templates.clone());

    for task in &task_templates {
        if let Some(device_id) = task.assignee_device_id {
            if let Some(device) = state
                .world
                .devices
                .iter_mut()
                .find(|device| device.id == device_id)
            {
                device.assigned_task_ids.push(task.id);
                device.current_task_id.get_or_insert(task.id);
                device.status = DeviceStatus::Working;
                device.last_tick_at = Some(now());
                device.updated_at = now();
            }
        }
    }

    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Info,
        "gateway",
        format!(
            "AR 眼镜目标 {} 已进入中枢网关，LLM agents 生成 {} 个协同任务并立即指派可用终端",
            goal.title,
            task_templates.len()
        ),
        Some(goal.id),
    );

    if task_templates
        .iter()
        .any(|task| task.assignee_device_id.is_none())
    {
        push_log(
            state,
            LogLevel::Warn,
            "gateway",
            "存在未指派任务：当前没有满足计划约束的可用终端",
            Some(goal.id),
        );
    }

    Ok(state.clone())
}

fn interrupt_active_work(state: &mut SimulationState, goal: &Goal) {
    for task in state
        .world
        .tasks
        .iter_mut()
        .filter(|task| matches!(task.status, TaskStatus::Assigned | TaskStatus::InProgress))
    {
        task.status = TaskStatus::Blocked;
        task.updated_at = now();
    }

    for device in &mut state.world.devices {
        device.assigned_task_ids.clear();
        device.current_task_id = None;
        if device.active && device.status != DeviceStatus::Offline {
            device.status = DeviceStatus::Idle;
        }
        device.updated_at = now();
    }

    push_log(
        state,
        LogLevel::Warn,
        "planner",
        format!("最高级目标 {} 已打断当前任务队列", goal.title),
        Some(goal.id),
    );
}

fn advance_task_and_device(state: &mut SimulationState, step_seconds: f32) {
    let progress_step = state
        .world
        .rules
        .task_planning
        .task_progress_per_tick
        .max(0.01)
        * step_seconds.max(0.1);
    let battery_rules = &state.world.rules.battery;

    for device in &mut state.world.devices {
        if !device.active || device.status == DeviceStatus::Offline {
            continue;
        }

        device.last_tick_at = Some(now());

        match device.status {
            DeviceStatus::Moving => {
                device.battery -= battery_rules.moving_drain_per_tick * step_seconds;
            }
            DeviceStatus::Working => {
                device.battery -= battery_rules.working_drain_per_tick * step_seconds;
            }
            DeviceStatus::Charging => {
                device.battery += battery_rules.charging_recharge_per_tick * step_seconds;
            }
            DeviceStatus::Idle => {
                device.battery += battery_rules.idle_recharge_per_tick * step_seconds;
            }
            DeviceStatus::Offline => {}
        }

        device.battery = sanitize_battery(device.battery, device.battery_capacity);
        if device.battery <= battery_rules.critical_battery_threshold {
            device.status = DeviceStatus::Charging;
        } else if device.status == DeviceStatus::Charging && device.battery >= 90.0 {
            device.status = DeviceStatus::Idle;
        }
        device.updated_at = now();
    }

    for task in &mut state.world.tasks {
        if matches!(task.status, TaskStatus::Done | TaskStatus::Cancelled) {
            continue;
        }

        if let Some(device_id) = task.assignee_device_id {
            if let Some(device) = state
                .world
                .devices
                .iter()
                .find(|device| device.id == device_id)
            {
                if device.status == DeviceStatus::Offline {
                    task.status = TaskStatus::Blocked;
                    task.updated_at = now();
                    continue;
                }
            }
            task.status = TaskStatus::InProgress;
            task.progress += progress_step;
            if task.progress >= 1.0 {
                task.progress = 1.0;
                task.status = TaskStatus::Done;
                task.completed_at = Some(now());
                task.updated_at = now();
                if let Some(device) = state
                    .world
                    .devices
                    .iter_mut()
                    .find(|device| device.id == device_id)
                {
                    device
                        .assigned_task_ids
                        .retain(|assigned| *assigned != task.id);
                    device.current_task_id = device.assigned_task_ids.first().copied();
                    if device.assigned_task_ids.is_empty()
                        && device.battery > battery_rules.low_battery_threshold
                    {
                        device.status = DeviceStatus::Idle;
                    }
                    device.updated_at = now();
                }
            } else if let Some(device) = state
                .world
                .devices
                .iter_mut()
                .find(|device| device.id == device_id)
            {
                let weather_scale = climate_motion_scale(state.world.climate, device.kind);
                let wind = climate_wind_mps(state.world.climate);
                let step = device.physical_profile.max_speed_mps.max(0.1)
                    * weather_scale
                    * step_seconds.max(0.1);
                let heading_rad = device.orientation_deg.to_radians();
                let drift = if device.kind == DeviceKind::Drone {
                    wind * 0.04
                } else {
                    wind * 0.006
                } * step_seconds.max(0.1);
                device.position.x = (device.position.x + heading_rad.cos() * step + drift)
                    .clamp(0.0, state.world.size.x);
                device.position.z = (device.position.z + heading_rad.sin() * step + drift * 0.35)
                    .clamp(0.0, state.world.size.z);
                if device.kind == DeviceKind::Drone {
                    device.position.y = device
                        .position
                        .y
                        .max(device.physical_profile.min_work_altitude_m)
                        .min(device.physical_profile.max_work_altitude_m);
                }
                let task_factor = (task.priority as f32).max(1.0);
                device.orientation_deg =
                    (device.orientation_deg + (5.0 + task_factor) * step_seconds) % 360.0;
                device.updated_at = now();
            }
        } else {
            task.status = TaskStatus::Pending;
            task.updated_at = now();
        }
    }

    let completed_goal_ids = state
        .world
        .goals
        .iter()
        .filter(|goal| {
            goal.task_ids.iter().all(|task_id| {
                state
                    .world
                    .tasks
                    .iter()
                    .find(|task| task.id == *task_id)
                    .map(|task| task.status == TaskStatus::Done)
                    .unwrap_or(false)
            })
        })
        .map(|goal| goal.id)
        .collect::<Vec<_>>();

    for goal_id in completed_goal_ids {
        if let Some(goal) = state.world.goals.iter_mut().find(|goal| goal.id == goal_id) {
            goal.status = GoalStatus::Completed;
            goal.completed_at = Some(now());
            goal.updated_at = now();
        }
    }
}

pub fn tick_simulation(state: &mut SimulationState, input: TickInput) -> Result<SimulationState> {
    let steps = input.steps.unwrap_or(1).max(1);
    for _ in 0..steps {
        state.world.tick_index += 1;
        // 这里按 tick 推进设备状态、电量与任务进度，保持仿真链路单向可追踪。
        advance_task_and_device(state, state.settings.default_tick_seconds);

        if state.settings.auto_save_every_tick {
            state.world.updated_at = now();
        }

        if state
            .world
            .devices
            .iter()
            .all(|device| device.battery <= 0.0)
        {
            push_log(
                state,
                LogLevel::Warn,
                "simulation",
                "所有设备电量已耗尽",
                Some(state.world.id),
            );
            break;
        }
    }

    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Debug,
        "simulation",
        format!("已推进 {} 个 tick", steps),
        Some(state.world.id),
    );
    Ok(state.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overpass_node_without_geometry_uses_lat_lon() {
        let mut tags = BTreeMap::new();
        tags.insert("amenity".to_string(), "cafe".to_string());
        tags.insert("name".to_string(), "街角咖啡".to_string());
        let element = OverpassElement {
            id: 42,
            element_type: "node".to_string(),
            lat: Some(31.2305),
            lon: Some(121.4738),
            tags,
            geometry: Vec::new(),
        };

        let feature = overpass_element_to_feature(
            element,
            31.2304,
            121.4737,
            Vector3::new(100.0, 90.0, 100.0),
            500.0,
        )
        .expect("node POI should become a landmark feature");

        assert_eq!(feature.kind, WorldObjectKind::Landmark);
        assert_eq!(feature.properties.get("source").map(String::as_str), Some("openstreetmap"));
        assert_eq!(feature.properties.get("osm_type").map(String::as_str), Some("node"));
        assert!(feature.properties.contains_key("lat"));
        assert!(feature.properties.contains_key("lon"));
    }
}
