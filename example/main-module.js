"use strict";
let SiblingModule = require('./sibling-module.js');

exports.x = "value from my module x";

exports.logX = () => {
  return SiblingModule.x;
};

module.arr = [2, 3];

if (Object !== SiblingModule.reexportedObject) {
  console.error('The two global Object references should be identical');
}
