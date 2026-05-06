// CoreLocation 桥接：从 Rust 同步获取一次定位。
// 调用约定：
//   返回 0 表示成功，*lat / *lon / *alt / *acc 已写入；
//   返回 1 表示 CoreLocation 报错，error_buf 为本地化文案；
//   返回 2 表示超时；
//   返回 3 表示授权被拒绝（Privacy & Security 中关闭了定位权限）。

#import <CoreLocation/CoreLocation.h>
#import <Foundation/Foundation.h>
#include <string.h>

@interface WSLocationDelegate : NSObject <CLLocationManagerDelegate>
@property (atomic) BOOL done;
@property (atomic, copy) NSString *errorMessage;
@property (atomic) double latitude;
@property (atomic) double longitude;
@property (atomic) double altitude;
@property (atomic) double horizontalAccuracy;
@property (atomic) BOOL authorizationDenied;
@end

@implementation WSLocationDelegate

- (void)locationManager:(CLLocationManager *)manager
     didUpdateLocations:(NSArray<CLLocation *> *)locations {
    CLLocation *loc = locations.lastObject;
    if (loc == nil) {
        self.errorMessage = @"CoreLocation 未返回任何位置样本";
        self.done = YES;
        return;
    }
    self.latitude = loc.coordinate.latitude;
    self.longitude = loc.coordinate.longitude;
    self.altitude = loc.altitude;
    self.horizontalAccuracy = loc.horizontalAccuracy;
    self.done = YES;
    [manager stopUpdatingLocation];
}

- (void)locationManager:(CLLocationManager *)manager
       didFailWithError:(NSError *)error {
    self.errorMessage = error.localizedDescription ?: @"CoreLocation 未知错误";
    self.done = YES;
}

- (void)locationManager:(CLLocationManager *)manager
    didChangeAuthorizationStatus:(CLAuthorizationStatus)status {
    if (status == kCLAuthorizationStatusDenied ||
        status == kCLAuthorizationStatusRestricted) {
        self.authorizationDenied = YES;
        self.errorMessage = @"系统拒绝了定位权限（请到 系统设置 → 隐私与安全性 → 定位服务 中开启）";
        self.done = YES;
    } else if (status == kCLAuthorizationStatusAuthorized ||
               status == kCLAuthorizationStatusAuthorizedAlways) {
        // 授权完成后再发起一次请求，确保系统返回最新的位置样本。
        [manager requestLocation];
    }
}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager API_AVAILABLE(macos(11.0)) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    [self locationManager:manager didChangeAuthorizationStatus:manager.authorizationStatus];
#pragma clang diagnostic pop
}

@end

static int ws_run_until_done(WSLocationDelegate *delegate, double timeout_seconds) {
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:timeout_seconds];
    while (!delegate.done && deadline.timeIntervalSinceNow > 0) {
        @autoreleasepool {
            NSDate *slice = [NSDate dateWithTimeIntervalSinceNow:0.1];
            [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:slice];
        }
    }
    return delegate.done ? 0 : 2;
}

int ws_get_native_location(double *lat,
                           double *lon,
                           double *alt,
                           double *acc,
                           char *error_buf,
                           size_t error_len,
                           double timeout_seconds) {
    @autoreleasepool {
        if (![CLLocationManager locationServicesEnabled]) {
            const char *msg = "macOS 定位服务未启用";
            if (error_buf && error_len > 0) {
                strncpy(error_buf, msg, error_len - 1);
                error_buf[error_len - 1] = '\0';
            }
            return 1;
        }

        WSLocationDelegate *delegate = [[WSLocationDelegate alloc] init];
        CLLocationManager *manager = [[CLLocationManager alloc] init];
        manager.delegate = delegate;
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters;
        manager.distanceFilter = kCLDistanceFilterNone;

        // requestAlwaysAuthorization 在沙箱外的桌面 app 不强制需要，requestLocation 会触发权限对话框。
        [manager requestLocation];

        int rc = ws_run_until_done(delegate, timeout_seconds);

        if (rc != 0) {
            const char *msg = "CoreLocation 请求超时";
            if (error_buf && error_len > 0) {
                strncpy(error_buf, msg, error_len - 1);
                error_buf[error_len - 1] = '\0';
            }
            return rc;
        }

        if (delegate.errorMessage != nil) {
            const char *raw = delegate.errorMessage.UTF8String;
            if (error_buf && error_len > 0 && raw != NULL) {
                strncpy(error_buf, raw, error_len - 1);
                error_buf[error_len - 1] = '\0';
            }
            return delegate.authorizationDenied ? 3 : 1;
        }

        if (lat) *lat = delegate.latitude;
        if (lon) *lon = delegate.longitude;
        if (alt) *alt = delegate.altitude;
        if (acc) *acc = delegate.horizontalAccuracy;
        return 0;
    }
}
