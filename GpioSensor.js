/* jshint node: true */
"use strict";
const rpio = require("rpio");
const BaseSensor = require("./BaseSensor.js")

class GpioSensor extends BaseSensor
{

  constructor(name, pin, activeValue)
  {
    super(name);
    rpio.open(pin, rpio.INPUT, activeValue === 1 ? rpio.PULL_DOWN : rpio.PULL_UP);
    rpio.poll(pin, this.stateChanged.bind(this), rpio.POLL_BOTH);
    this.pin = pin;
    this.activeValue = activeValue;
    this.confirmTimeout = null;
  }

  get state()
  {
    return rpio.read(this.pin) === this.activeValue;
  }

  stateChanged(pin)
  {
    if (this.pin !== pin)
    {
      return;
    }
    if (this.confirmTimeout !== null)
    {
      clearTimeout(this.confirmTimeout);
    }
    this.confirmTimeout = setTimeout(this.confirmState.bind(this, this.state), 100);
  }

  confirmState(triggeredeValue)
  {
    if (this.confirmTimeout !== null)
    {
      clearTimeout(this.confirmTimeout);
    }
    // once in a while rpio raises a state changed while the sensor hasn't been activated.
    // rereading the value after a short while acts a guard against a faulty reads
    if (triggeredeValue === this.state)
    {
      super.trigger(triggeredeValue);
    }
    else
    {
      this.emit("error", triggeredeValue);
    }
  }
}

module.exports = GpioSensor;