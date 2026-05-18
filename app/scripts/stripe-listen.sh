#!/bin/sh
# Start `stripe listen` forwarding BOTH platform + Connect events to
# the local dev server. The Connect forward is what makes
# account.updated webhooks reach the dev server — without it the
# verified-state transition is invisible to BB on localhost.

URL="localhost:3000/api/webhooks/stripe"

exec stripe listen \
  --forward-to "$URL" \
  --forward-connect-to "$URL"
