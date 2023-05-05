# install compiler explorer
git clone https://github.com/compiler-explorer/compiler-explorer.git
cd ./compiler-explorer/
npm install

# return to project directory, replace files in compiler explorer with our changed files
# this is to circumvent compiler explorer's husky installation, which requires a git log
cd ..
mv ./compiler-explorer-changed-files/c++.local.properties ./compiler-explorer/etc/config/c++.local.properties
mv ./compiler-explorer-changed-files/llvm-ir.ts ./compiler-explorer/lib/llvm-ir.ts
npm install