打包步骤
1. 先编译angular,然后把angular/dist/hl7parsegui目录下面所有的包括子目录browser都copy到hl7prase的public目录下面
2. package.json里面加入
   "name": "hl7parse",
   "version": "1.0.0",
   "main": "index.js",
   "scripts": {
   "test": "jest",
   "build": "pkg ."
   },
   "bin": "./index.js",
   "pkg": {
   "assets": [
   "public/**/*",
   "node_modules/sqlite3/**/*",
   "300.xml"
   ],
   "targets": [
   "node18-win-x64"
   ],
   "outputPath": "dist"
   }, 
3. 运行npm run build 打包