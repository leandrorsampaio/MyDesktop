#!/bin/bash
cd "/Users/leandrorossisampaio/Desktop/+++/LeandroGit/MyDesktop"
node server.js &
sleep 1
# Get default profile alias and open it
DEFAULT_ALIAS=$(curl -s http://localhost:3001/api/profiles/default | python3 -c "import sys,json; print(json.load(sys.stdin).get('alias',''))" 2>/dev/null)
if [ -n "$DEFAULT_ALIAS" ]; then
    open "http://localhost:3001/${DEFAULT_ALIAS}"
else
    open "http://localhost:3001"
fi
wait
