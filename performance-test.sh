#!/bin/bash

# Performance Testing Script for Both Blog Sites
# Tests: Homepage, Post Pages, Images, Concurrent Load

echo "=========================================="
echo "Performance Testing - Both Sites"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# User agent to avoid bot blocking
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Test URLs
FFG_HOME="https://fruitionforestgarden.com"
TTA_HOME="https://thetecnoagrarian.com"
# Update these post URLs with actual post slugs from your sites
FFG_POST="https://fruitionforestgarden.com/post/bear-tracks-and-nose-print-at-our-campsite"
TTA_POST="https://thetecnoagrarian.com/post/new-post-title"

# Test function
test_url() {
    local url=$1
    local name=$2
    local target=$3
    
    local result=$(curl -o /dev/null -s -w "%{time_total}|%{size_download}|%{speed_download}|%{http_code}" \
        -H "User-Agent: $UA" \
        -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
        --max-time 10 \
        "$url" 2>&1)
    
    local time=$(echo $result | cut -d'|' -f1)
    local size=$(echo $result | cut -d'|' -f2)
    local speed=$(echo $result | cut -d'|' -f3)
    local code=$(echo $result | cut -d'|' -f4)
    
    # Convert time to seconds (it's already in seconds)
    local time_ms=$(echo "$time * 1000" | bc)
    
    printf "%-50s " "$name:"
    if (( $(echo "$time < $target" | bc -l) )); then
        printf "${GREEN}✓${NC} "
    else
        printf "${RED}✗${NC} "
    fi
    printf "%.3fs (target: <%.1fs) | Size: %s bytes | Speed: %.0f bytes/s | HTTP: %s\n" \
        "$time" "$target" "$size" "$speed" "$code"
    
    echo "$time|$size|$speed|$code"
}

echo "1. HOMEPAGE LOAD TIME TEST (Target: < 2 seconds)"
echo "---------------------------------------------------"
ffg_home_times=()
tta_home_times=()

for i in {1..5}; do
    echo "Test $i:"
    ffg_result=$(test_url "$FFG_HOME" "  FFG Homepage" 2.0)
    tta_result=$(test_url "$TTA_HOME" "  TTA Homepage" 2.0)
    ffg_home_times+=($(echo $ffg_result | cut -d'|' -f1))
    tta_home_times+=($(echo $tta_result | cut -d'|' -f1))
    sleep 0.5
done

# Calculate averages
ffg_avg=$(echo "${ffg_home_times[@]}" | awk '{sum=0; for(i=1;i<=NF;i++) sum+=$i; print sum/NF}')
tta_avg=$(echo "${tta_home_times[@]}" | awk '{sum=0; for(i=1;i<=NF;i++) sum+=$i; print sum/NF}')

echo ""
echo "Average Homepage Load Times:"
printf "  FFG: %.3fs\n" "$ffg_avg"
printf "  TTA: %.3fs\n" "$tta_avg"
echo ""

echo "2. POST PAGE LOAD TIME TEST (Target: < 3 seconds)"
echo "---------------------------------------------------"
ffg_post_times=()
tta_post_times=()

for i in {1..5}; do
    echo "Test $i:"
    ffg_result=$(test_url "$FFG_POST" "  FFG Post Page" 3.0)
    tta_result=$(test_url "$TTA_POST" "  TTA Post Page" 3.0)
    ffg_post_times+=($(echo $ffg_result | cut -d'|' -f1))
    tta_post_times+=($(echo $tta_result | cut -d'|' -f1))
    sleep 0.5
done

# Calculate averages
ffg_post_avg=$(echo "${ffg_post_times[@]}" | awk '{sum=0; for(i=1;i<=NF;i++) sum+=$i; print sum/NF}')
tta_post_avg=$(echo "${tta_post_times[@]}" | awk '{sum=0; for(i=1;i<=NF;i++) sum+=$i; print sum/NF}')

echo ""
echo "Average Post Page Load Times:"
printf "  FFG: %.3fs\n" "$ffg_post_avg"
printf "  TTA: %.3fs\n" "$tta_post_avg"
echo ""

echo "3. IMAGE LOADING PERFORMANCE TEST"
echo "---------------------------------------------------"
# Test OG images
test_url "${FFG_HOME}/images/HeroCamp-og.png" "  FFG OG Image" 2.0
test_url "${TTA_HOME}/images/Hero.png" "  TTA OG Image" 2.0
echo ""

echo "4. CONCURRENT USER HANDLING TEST (10 concurrent requests)"
echo "---------------------------------------------------"
echo "Testing FFG Homepage with 10 concurrent requests..."

start_time=$(date +%s.%N)
for i in {1..10}; do
    curl -o /dev/null -s -H "User-Agent: $UA" "$FFG_HOME" &
done
wait
end_time=$(date +%s.%N)
ffg_concurrent_time=$(echo "$end_time - $start_time" | bc)

echo "Testing TTA Homepage with 10 concurrent requests..."
start_time=$(date +%s.%N)
for i in {1..10}; do
    curl -o /dev/null -s -H "User-Agent: $UA" "$TTA_HOME" &
done
wait
end_time=$(date +%s.%N)
tta_concurrent_time=$(echo "$end_time - $start_time" | bc)

printf "  FFG: %.3fs for 10 concurrent requests\n" "$ffg_concurrent_time"
printf "  TTA: %.3fs for 10 concurrent requests\n" "$tta_concurrent_time"
echo ""

echo "=========================================="
echo "PERFORMANCE TEST SUMMARY"
echo "=========================================="
echo ""
echo "Homepage Load Times (Target: < 2s):"
if (( $(echo "$ffg_avg < 2.0" | bc -l) )); then
    printf "  FFG: ${GREEN}✓ PASS${NC} (%.3fs)\n" "$ffg_avg"
else
    printf "  FFG: ${RED}✗ FAIL${NC} (%.3fs)\n" "$ffg_avg"
fi
if (( $(echo "$tta_avg < 2.0" | bc -l) )); then
    printf "  TTA: ${GREEN}✓ PASS${NC} (%.3fs)\n" "$tta_avg"
else
    printf "  TTA: ${RED}✗ FAIL${NC} (%.3fs)\n" "$tta_avg"
fi
echo ""
echo "Post Page Load Times (Target: < 3s):"
if (( $(echo "$ffg_post_avg < 3.0" | bc -l) )); then
    printf "  FFG: ${GREEN}✓ PASS${NC} (%.3fs)\n" "$ffg_post_avg"
else
    printf "  FFG: ${RED}✗ FAIL${NC} (%.3fs)\n" "$ffg_post_avg"
fi
if (( $(echo "$tta_post_avg < 3.0" | bc -l) )); then
    printf "  TTA: ${GREEN}✓ PASS${NC} (%.3fs)\n" "$tta_post_avg"
else
    printf "  TTA: ${RED}✗ FAIL${NC} (%.3fs)\n" "$tta_post_avg"
fi
echo ""

