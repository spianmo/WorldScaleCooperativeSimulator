import g1UrdfUrl from '../../assets/models/unitree_g1/g1_29dof.urdf';
import g1HeadLink from '../../assets/models/unitree_g1/head_link.STL';
import g1LeftAnklePitch from '../../assets/models/unitree_g1/left_ankle_pitch_link.STL';
import g1LeftAnkleRoll from '../../assets/models/unitree_g1/left_ankle_roll_link.STL';
import g1LeftElbow from '../../assets/models/unitree_g1/left_elbow_link.STL';
import g1LeftHipPitch from '../../assets/models/unitree_g1/left_hip_pitch_link.STL';
import g1LeftHipRoll from '../../assets/models/unitree_g1/left_hip_roll_link.STL';
import g1LeftHipYaw from '../../assets/models/unitree_g1/left_hip_yaw_link.STL';
import g1LeftKnee from '../../assets/models/unitree_g1/left_knee_link.STL';
import g1LeftShoulderPitch from '../../assets/models/unitree_g1/left_shoulder_pitch_link.STL';
import g1LeftShoulderRoll from '../../assets/models/unitree_g1/left_shoulder_roll_link.STL';
import g1LeftShoulderYaw from '../../assets/models/unitree_g1/left_shoulder_yaw_link.STL';
import g1LogoLink from '../../assets/models/unitree_g1/logo_link.STL';
import g1Pelvis from '../../assets/models/unitree_g1/pelvis.STL';
import g1RightAnklePitch from '../../assets/models/unitree_g1/right_ankle_pitch_link.STL';
import g1RightAnkleRoll from '../../assets/models/unitree_g1/right_ankle_roll_link.STL';
import g1RightElbow from '../../assets/models/unitree_g1/right_elbow_link.STL';
import g1RightHipPitch from '../../assets/models/unitree_g1/right_hip_pitch_link.STL';
import g1RightHipRoll from '../../assets/models/unitree_g1/right_hip_roll_link.STL';
import g1RightHipYaw from '../../assets/models/unitree_g1/right_hip_yaw_link.STL';
import g1RightKnee from '../../assets/models/unitree_g1/right_knee_link.STL';
import g1RightShoulderPitch from '../../assets/models/unitree_g1/right_shoulder_pitch_link.STL';
import g1RightShoulderRoll from '../../assets/models/unitree_g1/right_shoulder_roll_link.STL';
import g1RightShoulderYaw from '../../assets/models/unitree_g1/right_shoulder_yaw_link.STL';
import g1TorsoLink from '../../assets/models/unitree_g1/torso_link.STL';
import g1WaistYaw from '../../assets/models/unitree_g1/waist_yaw_link.STL';

import go2UrdfUrl from '../../assets/models/unitree_go2/go2_description.urdf';
import go2Base from '../../assets/models/unitree_go2/base.dae';
import go2Calf from '../../assets/models/unitree_go2/calf.dae';
import go2CalfMirror from '../../assets/models/unitree_go2/calf_mirror.dae';
import go2Foot from '../../assets/models/unitree_go2/foot.dae';
import go2Hip from '../../assets/models/unitree_go2/hip.dae';
import go2Thigh from '../../assets/models/unitree_go2/thigh.dae';
import go2ThighMirror from '../../assets/models/unitree_go2/thigh_mirror.dae';

export interface UnitreeModel {
  urdf: string;
  meshes: Record<string, string>;
}

export const g1: UnitreeModel = {
  urdf: g1UrdfUrl,
  meshes: {
    'head_link.stl': g1HeadLink,
    'left_ankle_pitch_link.stl': g1LeftAnklePitch,
    'left_ankle_roll_link.stl': g1LeftAnkleRoll,
    'left_elbow_link.stl': g1LeftElbow,
    'left_hip_pitch_link.stl': g1LeftHipPitch,
    'left_hip_roll_link.stl': g1LeftHipRoll,
    'left_hip_yaw_link.stl': g1LeftHipYaw,
    'left_knee_link.stl': g1LeftKnee,
    'left_shoulder_pitch_link.stl': g1LeftShoulderPitch,
    'left_shoulder_roll_link.stl': g1LeftShoulderRoll,
    'left_shoulder_yaw_link.stl': g1LeftShoulderYaw,
    'logo_link.stl': g1LogoLink,
    'pelvis.stl': g1Pelvis,
    'right_ankle_pitch_link.stl': g1RightAnklePitch,
    'right_ankle_roll_link.stl': g1RightAnkleRoll,
    'right_elbow_link.stl': g1RightElbow,
    'right_hip_pitch_link.stl': g1RightHipPitch,
    'right_hip_roll_link.stl': g1RightHipRoll,
    'right_hip_yaw_link.stl': g1RightHipYaw,
    'right_knee_link.stl': g1RightKnee,
    'right_shoulder_pitch_link.stl': g1RightShoulderPitch,
    'right_shoulder_roll_link.stl': g1RightShoulderRoll,
    'right_shoulder_yaw_link.stl': g1RightShoulderYaw,
    'torso_link.stl': g1TorsoLink,
    'waist_yaw_link.stl': g1WaistYaw,
  },
};

export const go2: UnitreeModel = {
  urdf: go2UrdfUrl,
  meshes: {
    'base.dae': go2Base,
    'calf.dae': go2Calf,
    'calf_mirror.dae': go2CalfMirror,
    'foot.dae': go2Foot,
    'hip.dae': go2Hip,
    'thigh.dae': go2Thigh,
    'thigh_mirror.dae': go2ThighMirror,
  },
};

export function meshBasename(path: string): string {
  const last = path.split('/').pop() ?? path;
  return last.toLowerCase();
}
