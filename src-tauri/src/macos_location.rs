//! macOS CoreLocation 桥接（同步阻塞调用），底层是 src/macos_location.m。

use std::ffi::CStr;
use std::os::raw::{c_char, c_double, c_int};

#[derive(Debug, Clone, Copy)]
pub struct NativeCoords {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_m: f64,
    pub horizontal_accuracy_m: f64,
}

extern "C" {
    fn ws_get_native_location(
        lat: *mut c_double,
        lon: *mut c_double,
        alt: *mut c_double,
        acc: *mut c_double,
        error_buf: *mut c_char,
        error_len: usize,
        timeout_seconds: c_double,
    ) -> c_int;
}

pub fn request_native_location(timeout_seconds: f64) -> Result<NativeCoords, String> {
    let mut latitude = 0.0_f64;
    let mut longitude = 0.0_f64;
    let mut altitude = 0.0_f64;
    let mut accuracy = 0.0_f64;
    let mut error_buf = vec![0_u8; 512];

    let code = unsafe {
        ws_get_native_location(
            &mut latitude as *mut f64,
            &mut longitude as *mut f64,
            &mut altitude as *mut f64,
            &mut accuracy as *mut f64,
            error_buf.as_mut_ptr() as *mut c_char,
            error_buf.len(),
            timeout_seconds,
        )
    };

    if code == 0 {
        Ok(NativeCoords {
            latitude,
            longitude,
            altitude_m: altitude,
            horizontal_accuracy_m: accuracy,
        })
    } else {
        let cstr = unsafe { CStr::from_ptr(error_buf.as_ptr() as *const c_char) };
        let message = cstr.to_string_lossy().into_owned();
        Err(match code {
            2 => format!("CoreLocation 超时：{message}"),
            3 => format!("CoreLocation 授权被拒绝：{message}"),
            _ => format!("CoreLocation 失败（code={code}）：{message}"),
        })
    }
}
