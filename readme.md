# VSCode "Send Help!"

Send Help is a project for UVA's graduate level compilers class (CS6620) in Spring 2023. The goal of the project is to identify optimizable code of source C++ with specific LLVM optimization passes.

This project is built off of:
- VSCode Compiler Explorer: https://github.com/MRobertEvers/vscode-compiler-explorer
- Compiler Explorer: https://github.com/mattgodbolt/compiler-explorer

## Prerequisites

Our project was developed in  Linux distrobution based on Debian (Ubuntu 20.04). The following packages are required (may need administrator priviledges):
- git: ```apt install git```
- clang 14: ```apt install clang```
- llvm opt: ```apt install llvm```
- npm: ```apt install nodejs npm```
- VSCode: https://code.visualstudio.com/download

## Installation

We cloned both repositories and changed several files to make our extension run as expected. Run the following commands to install this project:

```
git clone https://github.com/jjg4qbv/vscode_send_help.git
cd vscode_send_help
chmod +x setup.bash
./setup.bash
```
Our project uses a setup script that clones Compiler Explorer, creates all of its requires modules, and then copies over several files that we changed. This is to circumvent a problem with installing Husky, a npm package that requires a git log.

## Running the Program

Begin by opening a ```localhost``` instance of Compiler Explorer:
```
cd compiler-explorer
make dev
```

In a separate terminal, open the root directory of this project:
1. Run ```code .``` to open VSCode in the current directory.
2. Open the VSCode debugger (the default keybind is ```F5```) and select "Debug Anyway" if the prompt shows up. Wait until Extension Development Host initialization is finished.
3. In the newly opened Extension Development Host, search for a command to run with ```Ctrl + Shift + P``` and select "compiler-explorer.open"

## How it Works

Our project currently uses the VSCode debugger to emulate the project as a VSCode extension, as it is not currently published to the VSCode Marketplace.

The procedure of Send Help is as follows:
1. In Compiler Explorer, start a localhost instance. We use the default settings along with port number, and we also changed ```llvm-ir.ts``` in Compiler Explorer to add debug information to LLVM IR returns.
2. We make an initial API call to the localhost instance using ```clang14``` (or whichever compiler is currently set up). This is called with the source code in the active VSCode editor window along with flags ```-g -S -emit-llvm```. See https://github.com/compiler-explorer/compiler-explorer/blob/main/docs/API.md for more information.
3. With the base LLVM, we filter out the IR for several keywords (notably ```optnone```, as otherwise future optimizations won't do anything). 
4. Using the cleaned IR, we use another API call to the localhost instance using ```opt``` as the compiler. The flags passed in are dependent on the ***TODO***.
5. We then determine the the changes in line scope between the initial unoptimized LLVM IR and the final optimized IR. We add underlining using VSCode Decorations for lines that were removed in the optimized instance. 

### Settings

To add a version of clang++ modify the ```c++.local.properties``` file found in ```/compiler-explorer/etc/config/```. Note that the local file will overwrite the default compiler-explorer options. See https://github.com/compiler-explorer/compiler-explorer/blob/main/docs/AddingACompiler.md for more information.

## Compiler Selection

Our project was developed with clang14 in mind; this can be changed by modifying the name of the compilers in ```package.json```:

```
 "compiler-explorer.compilerDefault": {
      "type": "string",
      "default": "clang14",
      "description": "Compiler code to use for unchecked file types",
      "scope": "window"
  },
  "compiler-explorer.compilerCpp": {
      "type": "string",
      "default": "clang14",
      "description": "Compiler code to use for c/c++ files",
      "scope": "window"
  },
```

## Current Restrictions and Bugs

Send Help currently uses a locally hosted API call to Compiler Explorer for every compiler run we want. We did this becuase we wanted to change several files in the Compiler Explorer source code and to also shorten development time, but this process is costly in computer resources.

***TODO***

## Future Work

This work could be expanded in the future; several ideas:
- adding arguments to the ```opt``` call
- interfacing with Compiler Explorer's code rather than using their REST API
