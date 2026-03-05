#!/bin/bash
set -e

# Benchmark script for claude-run
# Tests performance with different file sizes: 50MB, 200MB, 500MB

BENCH_DIR="${BENCH_DIR:-/tmp/claude-run-bench}"
SIZES=(50 200 500)  # MB

echo "=== Claude Run Benchmark Suite ==="
echo "Benchmark directory: $BENCH_DIR"
echo ""

# Create benchmark directory
mkdir -p "$BENCH_DIR"

# Generate test JSONL files at different sizes
generate_test_file() {
    local size_mb=$1
    local output_file="$BENCH_DIR/test_${size_mb}mb.jsonl"
    local target_bytes=$((size_mb * 1024 * 1024))
    local current_bytes=0

    echo "Generating test file: $output_file (target: ${size_mb}MB)"

    > "$output_file"  # Clear file

    local msg_num=0
    while [ $current_bytes -lt $target_bytes ]; do
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
        local message="{\"role\":\"user\",\"content\":\"This is test message $msg_num with some padding to increase file size. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\"}"

        echo "$message" >> "$output_file"

        current_bytes=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null)
        msg_num=$((msg_num + 1))
    done

    echo "✓ Generated: $(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null) bytes"
}

# Run benchmark on a test file
run_benchmark() {
    local size_mb=$1
    local test_file="$BENCH_DIR/test_${size_mb}mb.jsonl"

    echo ""
    echo "Benchmarking: ${size_mb}MB file"
    echo "File: $test_file"

    # Build release binary
    echo "Building release binary..."
    cargo build --release 2>&1 | grep -v "Compiling\|Finished" || true

    # Create temporary project directory
    local project_dir="$BENCH_DIR/project_${size_mb}mb"
    mkdir -p "$project_dir"
    cp "$test_file" "$project_dir/conversation.jsonl"

    # Start server and measure time
    echo "Starting server and warming up..."
    local start_time=$(date +%s%N)

    timeout 10 ./target/release/claude-run --dir "$BENCH_DIR" > /dev/null 2>&1 &
    local server_pid=$!

    sleep 2  # Let server start

    # Make test request
    echo "Making test request..."
    local request_start=$(date +%s%N)
    curl -s http://localhost:5678/api/conversations > /dev/null
    local request_end=$(date +%s%N)

    kill $server_pid 2>/dev/null || true
    wait $server_pid 2>/dev/null || true

    local request_duration=$(( (request_end - request_start) / 1000000 ))
    echo "Request time: ${request_duration}ms"
}

# Main execution
for size in "${SIZES[@]}"; do
    generate_test_file $size
done

echo ""
echo "=== Running Benchmarks ==="
for size in "${SIZES[@]}"; do
    run_benchmark $size
done

echo ""
echo "✓ Benchmark suite completed"
