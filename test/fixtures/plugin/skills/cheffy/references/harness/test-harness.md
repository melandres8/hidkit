---
harness: test-harness
verified_with:
  version: "9.9.9"
version_command: [node, -e, "console.log('test-harness 9.9.9')"]
detect_env: HIDKIT_TEST_HARNESS
model_selection: true
tiers:
  strong: opus
  fast: sonnet
shell_tools: [Bash]
enforcement:
  tool_allowlist: true
---
Test harness map.
