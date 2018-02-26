const rpio = require("rpio");

class AutoResetSwitch
{

    constructor(log, pin, activeValue, cycle)
    {
        this._log = log;
        this._activeValue = activeValue;
        this._pin = pin;
        this._cycle = cycle;
        rpio.open(this._pin, rpio.OUTPUT, 1 - this._activeValue);
    }

    trigger(count)
    {
        if (count === 0)
        {
            return;
        }
        this._log("Turning on switch, pin " + this._pin + " = " + this._activeValue);
        rpio.write(this._pin, this._activeValue);
        count -= 1;
        setTimeout(this._switchOff.bind(this, count), this._cycle);
    }

    _switchOff(count)
    {
        this._log("Turning off switch, pin " + this._pin + " = " + (1 - this._activeValue));
        rpio.write(this._pin, 1 - this._activeValue);
        if (count > 0)
        {
            setTimeout(this.trigger.bind(this), this._cycle);
        }
    }
}

module.exports = AutoResetSwitch;