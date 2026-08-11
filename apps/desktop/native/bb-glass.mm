#include <node_api.h>
#include <string>

#import <AppKit/AppKit.h>
#import <objc/runtime.h>

@interface BbGlassRegionSet : NSObject
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSVisualEffectView *> *views;
@end

@implementation BbGlassRegionSet

- (instancetype)init {
  self = [super init];
  if (self != nil) {
    _views = [NSMutableDictionary dictionary];
  }
  return self;
}

@end

static const void *kBbGlassRegionSetKey = &kBbGlassRegionSetKey;

static bool readDouble(napi_env env, napi_value object, const char *name,
                       double *value) {
  napi_value property;
  if (napi_get_named_property(env, object, name, &property) != napi_ok) {
    return false;
  }
  return napi_get_value_double(env, property, value) == napi_ok;
}

static NSString *readString(napi_env env, napi_value object, const char *name) {
  napi_value property;
  if (napi_get_named_property(env, object, name, &property) != napi_ok) {
    return nil;
  }
  size_t size = 0;
  if (napi_get_value_string_utf8(env, property, nullptr, 0, &size) != napi_ok) {
    return nil;
  }
  std::string value(size + 1, '\0');
  if (napi_get_value_string_utf8(env, property, value.data(), value.size(),
                                 &size) != napi_ok) {
    return nil;
  }
  return [[NSString alloc] initWithBytes:value.data()
                                   length:size
                                 encoding:NSUTF8StringEncoding];
}

static NSVisualEffectView *createEffectView(NSView *container) {
  NSVisualEffectView *view = [[NSVisualEffectView alloc] initWithFrame:NSZeroRect];
  view.blendingMode = NSVisualEffectBlendingModeBehindWindow;
  view.material = NSVisualEffectMaterialUnderWindowBackground;
  view.state = NSVisualEffectStateActive;
  view.autoresizingMask = NSViewNotSizable;
  [container addSubview:view positioned:NSWindowBelow relativeTo:nil];
  return view;
}

static napi_value setRegions(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc != 2) {
    napi_throw_type_error(env, nullptr, "setRegions needs a window handle and regions");
    return nullptr;
  }

  void *handle = nullptr;
  size_t handleSize = 0;
  if (napi_get_buffer_info(env, argv[0], &handle, &handleSize) != napi_ok ||
      handleSize < sizeof(void *)) {
    napi_throw_type_error(env, nullptr, "The window handle is not valid");
    return nullptr;
  }

  bool isArray = false;
  napi_is_array(env, argv[1], &isArray);
  if (!isArray) {
    napi_throw_type_error(env, nullptr, "The regions value must be an array");
    return nullptr;
  }

  NSView *hostView = (__bridge NSView *)(*(void **)handle);
  NSWindow *window = hostView.window;
  NSView *container = window.contentView;
  if (window == nil || container == nil) {
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
  }

  BbGlassRegionSet *regionSet = objc_getAssociatedObject(window, kBbGlassRegionSetKey);
  if (regionSet == nil) {
    regionSet = [[BbGlassRegionSet alloc] init];
    objc_setAssociatedObject(window, kBbGlassRegionSetKey, regionSet,
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }

  NSMutableSet<NSString *> *activeIds = [NSMutableSet set];
  uint32_t length = 0;
  napi_get_array_length(env, argv[1], &length);
  for (uint32_t index = 0; index < length; index += 1) {
    napi_value item;
    napi_get_element(env, argv[1], index, &item);
    NSString *regionId = readString(env, item, "id");
    double x = 0;
    double y = 0;
    double width = 0;
    double height = 0;
    double blur = 0;
    if (regionId == nil || !readDouble(env, item, "x", &x) ||
        !readDouble(env, item, "y", &y) ||
        !readDouble(env, item, "width", &width) ||
        !readDouble(env, item, "height", &height) ||
        !readDouble(env, item, "blur", &blur)) {
      continue;
    }

    [activeIds addObject:regionId];
    NSVisualEffectView *view = regionSet.views[regionId];
    if (view == nil) {
      view = createEffectView(container);
      regionSet.views[regionId] = view;
    }
    const CGFloat nativeY = NSHeight(container.bounds) - y - height;
    view.frame = NSMakeRect(x, nativeY, width, height);
    view.alphaValue = MAX(0.0, MIN(1.0, blur / 100.0));
    view.hidden = width <= 0 || height <= 0 || blur <= 0;
  }

  for (NSString *regionId in [regionSet.views.allKeys copy]) {
    if (![activeIds containsObject:regionId]) {
      [regionSet.views[regionId] removeFromSuperview];
      [regionSet.views removeObjectForKey:regionId];
    }
  }

  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}

static napi_value initialize(napi_env env, napi_value exports) {
  napi_value function;
  napi_create_function(env, "setRegions", NAPI_AUTO_LENGTH, setRegions, nullptr,
                       &function);
  napi_set_named_property(env, exports, "setRegions", function);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
