#!/usr/bin/env bash
# Tiny DASH-like test media (fragmented MP4, like Instagram's): run once, commit the outputs.
set -euo pipefail
cd "$(dirname "$0")"
FRAG='-movflags +frag_keyframe+empty_moov+default_base_moof'
ffmpeg -v error -y -f lavfi -i testsrc=size=270x480:rate=30 -t 2 -c:v libvpx-vp9 -b:v 300k -pix_fmt yuv420p $FRAG v-vp9.mp4
ffmpeg -v error -y -f lavfi -i sine=frequency=440:duration=2 -c:a aac -b:a 64k $FRAG a-aac.mp4
ffmpeg -v error -y -f lavfi -i testsrc=size=180x320:rate=30 -f lavfi -i sine=duration=2 -t 2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest prog-720.mp4
# Audio in a codec Mediabunny doesn't know (ALAC): the join leaves the sound out instead of failing.
ffmpeg -v error -y -f lavfi -i sine=frequency=440:duration=2 -ar 8000 -c:a alac $FRAG a-alac.mp4
