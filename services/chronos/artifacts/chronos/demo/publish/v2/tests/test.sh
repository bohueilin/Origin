#!/usr/bin/env bash
set +e
bash -lc 'pgrep -x mongod >/dev/null || mongod --fork --logpath /var/log/mongodb.log --dbpath /data/db >/tmp/mongod-start.log 2>&1'
cd /
unset PYTHONPATH PYTHONHOME
export PYTHONNOUSERSITE=1
export PYTHONSAFEPATH=1
export PYTEST_DISABLE_PLUGIN_AUTOLOAD=1
bash -lc 'python3 -m pytest /tests/task_assets/test_outputs.py -rA -q > .grade.log 2>&1; rc=$?; cat .grade.log; exit $rc'
rc=$?
mkdir -p /logs/verifier
if [ "$rc" -eq 0 ]; then echo 1 > /logs/verifier/reward.txt; else echo 0 > /logs/verifier/reward.txt; fi
exit 0
