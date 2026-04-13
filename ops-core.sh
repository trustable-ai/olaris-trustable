#!/bin/sh
set -e

for candidate in \
  "$OPS_CORE_ROOT" \
  "$OPS_OLARIS" \
  "${OPS_HOME:-$HOME/.ops}/bestia/olaris" \
  "$PWD/../olaris" \
  "$PWD/../../olaris" \
  "$PWD/../../../olaris"
do
  if test -n "$candidate" -a -d "$candidate"
  then
    OPS_ROOT="$candidate" exec ops "$@"
  fi
done

exec ops "$@"
