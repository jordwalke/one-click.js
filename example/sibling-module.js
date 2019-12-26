"use strict";
// Requires ./subdir/index.js
const SubdirIndex = require('./subdir');
// Requires ./main-module.js (circular!)
const MainModule = require('./main-module.js');

exports.x = "value from other module x";
exports.otherModuleFoo = {
  bar: "asdlfkj"
};
exports.bar = "asldkfj"
let x = "sadlkfj";
/**
 * See, circular references are allowed as long as they do not
 * reference their mutual members at module load time. They can
 * access them late-ly in an exported function etc.
 * MainModule depends on OtherModule and vice versa.
 */
exports.logX = () => {
  console.log('why no debug');
  return MainModule.x;
};

exports.reexportedObject = Object;
