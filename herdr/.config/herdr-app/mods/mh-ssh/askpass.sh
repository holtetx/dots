#!/bin/sh
# ssh runs this for every prompt (SSH_ASKPASS_REQUIRE=force). Only a password comes from 1Password; anything else (a new host key) fails, so accept that by hand once.
case "$1" in *assword*) exec op read "$MH_SSH_OP" ;; esac
exit 1
