/* jshint node: true */
"use strict";
var MotorizedDoor = require("./MotorizedDoor.js")

module.exports = function (homebridge)
{
  homebridge.registerAccessory(
    "homebridge-gpio-motorized-door",
    "MotorizedDoor",
    function(log, config){ return new MotorizedDoor(homebridge, log, config);});
};