Create script trustable.sh and a trustable.ps1
Overview
- check docker is installed
- set variables
- set the firewall to localhost:80
- download ops
- donwload ops plugin
- recommend installation instructions

# check

- docker is available on the path, if not abort recommending to install docker desktop from https://www.docker.com

# set variables
- OPS_REPO=https://github.com/nuvolaris/bestia
- OPS_BRANCH=bestia

on windows, set the system variables
on linux, add to .bashrc and .profile
on mac add to .bashrc and .zshrc

Avoid adding multiple times

# Download ops:

curl -fsSL n7s.co/get-ops | bash on Linux/Mac
irm n7s.co/get-ops-exe | iex on Windows

once downloaded,

# open the firewall

write a message: "I need your autorization to open the firewall to a local web server to run the application. Confirm"

If the user accepts, open the firewall to localhost:80 (skip for mac):

## on linux with either:
- sudo ufw status
- sudo firewall-cmd --state
- sudo iptables -L -n

## on windows from powershell:
Start-Process powershell -Verb RunAs -ArgumentList `
  "New-NetFirewallRule -DisplayName 'Trustable' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow"

# install ops

ensure the variables are locally set
set locally OPS_BRANCH and OPS_REPO

execute ops -t

and then download the plugin with

ops -plugin https://github.com/trustable-ai/olaris-trustable

add the

# Finally display a message

Notify the download with

ops trustable notify MSG=Download

then write:

==================================================
 Please reopen this terminal before using ops.
 Install Trustable with: 'ops trustable setup'
 For more information and bug reports:
 https://github.com/trustable-ai
==================================================
