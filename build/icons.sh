#!/bin/sh
# Renders the icons from the two drawings: the reduced one for 16 and 32 pixels, where the full
# logo turns to mush, the full one from 48 up; and the images for the stores.
set -eu
cd "$(dirname "$0")/.."
for n in 16 32; do rsvg-convert -w $n -h $n icons/logo-small.svg -o icons/$n.png; done
for n in 48 96 128; do rsvg-convert -w $n -h $n icons/logo.svg -o icons/$n.png; done
rsvg-convert -w 300 -h 300 icons/logo.svg -o store/logo-300.png
rsvg-convert -w 512 -h 512 icons/logo.svg -o store/logo-512.png
