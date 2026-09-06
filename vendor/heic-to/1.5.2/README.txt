heic-to 1.5.2, unmodified dist/csp/heic-to.js from the npm release.
Copyright and license: see LICENSE.txt (LGPL-3.0).
Upstream: https://github.com/hoppergee/heic-to
Original npm package (includes wrapper source/build scripts): ./source.tgz
Underlying decoder: libheif 1.22.2, with libde265 1.0.16.
Source: https://github.com/strukturag/libheif/tree/v1.22.2
Source: https://github.com/strukturag/libde265/tree/v1.0.16
Corresponding decoder sources, including their license notices, are also served
alongside this file as libheif-v1.22.2.tar.gz and libde265-v1.0.16.tar.gz.
Build instructions: upstream README and esbuild.mjs in source.tgz.
The CSP build uses USE_UNSAFE_EVAL=0 USE_WASM=0 in build-emscripten.sh.
This separately loaded library can be replaced with a compatible modified build.
The site imports heicTo({ blob, type: 'bitmap' }) only when native decoding fails.
No photos are sent to the package author or an external conversion service.
