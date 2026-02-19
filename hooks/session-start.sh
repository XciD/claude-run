#!/bin/bash
cat <<'EOF'
[claude-run] Rich HTML previews are available. You can embed interactive HTML visualizations inline in your responses using fenced code blocks with the `html:preview` language tag. claude-run renders them in a sandboxed iframe with Preview/Source tabs and auto-height.

Rules:
- Each preview must be fully self-contained (inline CSS/JS, no external dependencies)
- Include full HTML document structure (<html>, <head>, <style>, <body>)
- Use polished styling with dark backgrounds (#1a1a2e), don't inherit parent theme
- Use Canvas API for charts (CDN scripts blocked by sandbox)
- Always wrap drawing code in window.onload and handle devicePixelRatio
EOF
