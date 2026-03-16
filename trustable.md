Create script trustable.sh and a trustable.ps1 to set variables and download ops


- OPS_REPO=https://github.com/nuvolaris/bestia
- OPS_BRANCH=bestia

on windows, set the system variables
on linux, add to .bashrc and .profile
on mac add to .bashrc and .zshrc


Download ops invoking

curl -fsSL n7s.co/get-ops | bash on Linux/Mac
irm n7s.co/get-ops-exe | iex on Windows

once downloaded,

ensure the variables are locally set
execute ops -t

and then download the plugin with

ops -plugin https://github.com/trustable-ai/olaris-trustable


Finally display a message asking to close the terminal before using it and ask for the user to press a key.
