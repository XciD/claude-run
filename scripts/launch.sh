#!/bin/bash
BINARY="/Users/xcid/workspace/claude-run/target/release/claude-run"
codesign -s "Apple Development: adrien.69740@gmail.com (T2J3XG34UU)" --force "$BINARY" 2>/dev/null
exec "$BINARY" "$@"
