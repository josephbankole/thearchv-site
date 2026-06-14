#!/usr/bin/env bash
# Download the Legends Series headshots into public/legends/ so the site self-hosts them
# (CSP-clean, no dependency on Higgsfield's CDN). Run once from the repo root:
#   bash scripts/fetch-legends-headshots.sh
# Then commit public/legends/ and deploy.
set -euo pipefail

DIR="public/legends"
BASE="https://d8j0ntlcm91z4.cloudfront.net/user_3EYxWWaCOckmLgYMAE2OyJqeh3I"
mkdir -p "$DIR"

# slug                  source filename
fetch () { curl --fail --location --silent --show-error -o "$DIR/$1.webp" "$BASE/$2"; echo "  $1.webp"; }

echo "Downloading Legends headshots into $DIR ..."
fetch evra              "hf_20260614_133137_e76bb856-3f52-412b-84c8-579bc4d424da_min.webp"
fetch jota              "hf_20260614_123746_7d91762e-0a64-4b87-8d88-c37a24cb510c_min.webp"
fetch chicharito        "hf_20260614_123748_9d916059-e3be-4e63-bb3d-6f22a44578a7_min.webp"
fetch cobi-jones        "hf_20260614_123752_dfb66b6e-3dd5-441e-bd4c-481a8c8d469c_min.webp"
fetch atiba-hutchinson  "hf_20260614_123755_0d3df697-7a4d-40ba-b19e-2a45f515752d_min.webp"
fetch cruyff            "hf_20260614_123757_4eb8ea69-7379-430c-b3eb-a24fa4b6b66f_min.webp"
fetch iniesta           "hf_20260614_123722_4a551900-4bb0-4ee5-afe4-2c0b449df8fd_min.webp"
fetch bobby-charlton    "hf_20260614_130958_47544de6-c393-4549-9d72-ea59eb94e893_min.webp"
fetch quaresma          "hf_20260614_131000_7f188155-b4c1-4412-9546-5db62af7f915_min.webp"
fetch maradona          "hf_20260614_131003_7d5deffe-bddd-4950-b193-44e2265fe6b2_min.webp"
fetch pele              "hf_20260614_131006_c99294f6-158a-46c2-ab45-cc2c0db7367c_min.webp"
fetch platini           "hf_20260614_131008_77fdd41b-a811-4e75-9831-692161d6f155_min.webp"
fetch okocha            "hf_20260614_131010_7de4e475-f592-4aa6-a7d2-218a161ad52c_min.webp"
echo "Done. 13 headshots in $DIR. Now: git add public/legends && commit && deploy."
