/* jshint node: true */
"use strict";
const EventEmitter = require('events');

class BaseSensor extends EventEmitter
{

    constructor(name, initialState)
    {
        super();
        this._name = name;
        this._state = initialState;
    }

    get name()
    {
        return this._name;
    }

    get state()
    {

        return this._state;
    }

    trigger(value)
    {
        if (this._state === value)
        {
            return;
        }
        this._state = value;
        if (value)
        {
            this.emit("activated");
        }
        else
        {
            this.emit("deactivated");
        }
    }
}

module.exports = BaseSensor;