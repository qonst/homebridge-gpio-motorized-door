/* jshint node: true */
"use strict";
const BaseSensor = require("./BaseSensor.js")

class DummySensor extends BaseSensor 
{
    constructor(name, oppositeSensor, resetTime)
    {
        super(name);
        oppositeSensor.on("deactivated", this.bindTimeout.bind(this));
        oppositeSensor.on("activated", this.resetTimeoutHandler.bind(this) );
        oppositeSensor.on("activated", this.trigger.bind(this, false) );
        this._resetTime = resetTime;
    }

    bindTimeout()
    {
        this.resetTimeoutHandler();
        this.timeoutHandler = setTimeout(this.trigger.bind(this, true), this._resetTime * 1000 );
    }

    resetTimeoutHandler()
    {
        if (this.timeoutHandler !== null)
        {
            clearTimeout(this.timeoutHandler);
            this.timeoutHandler = null;
        }
    }
}

module.exports = DummySensor;