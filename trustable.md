Create script trustable.sh and a trustable.ps1
- check docker is installed
- check you have at least 16gb
- set variables
- download ops
- donwload ops plugin
- recommend installation instructions

Variables
- OPS_REPO=https://github.com/nuvolaris/bestia
- OPS_BRANCH=bestia

on windows, set the system variables
on linux, add to .bashrc and .profile
on mac add to .bashrc and .zshrc

Download ops invoking

curl -fsSL n7s.co/get-ops | bash on Linux/Mac
irm n7s.co/get-ops-exe | iex on Windows

once downloaded,

check there are at least 16gb of memory it not abort as insufficient memory

check docker is avaible on the path, if not abort recommending to install docker desktop from https://www.docker.com

set variables
then ensure the variables are locally set

execute ops -t

and then download the plugin with

ops -plugin https://github.com/trustable-ai/olaris-trustable


Finally display a message

================================================
 Please reopen this terminal before using ops.
 Install Trustable with: 'ops trustable setup'
 For more information and bug reports:
 https://github.com/trustable-ai/support
================================================
