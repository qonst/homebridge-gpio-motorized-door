# homebridge-gpio-motorized-door

## Sample configuration
```javascript
{
    "bridge":{
        "name":"My RPi bridge",
        "username":"00:00:00:00:00:00",
        "pin":"000-00-000"
    },
    "accessories":[
        {
            "accessory":"MotorizedDoor",
            "name":"Garage door",
            "closedSensor":{
                "pin":31,
                "activeValue":1
            },
            "openSensor":{
                "pin":32,
                "activeValue":1
            },
            "switch":{
                "pin":33,
                "activeValue":0,
                "cycle":600
            },
            "rpioSettings":{
                "gpiomem":true,
                "mapping":"physical"
            },
            "maxTransitionTime":14,
            "canBeStopped":true
        }
    ]
}
```
* for `switch`, `openSensor` and `closedSensor` 
  * `pin` value is the pin-number handed over to RPIO, configured by `rpioSettings`
  * `activeValue` is the value used to set/determine the on-state of the pin
* `switch` defines the relay triggering the door to open or close
  * `cycle` is the time in milliseconds the relay is set to `activeValue`
* `rpioSettings` is being passed to rpio when initializing
* `maxTransitionTime` is the time in seconds the transistion from open to closed (and vice versa) should take.
  If more time is spent before a sensor is triggered, the door is assumed to be stopped (either blocked by a foreign object or faulty).
* `openSensor` and `closedSensor` defines sensors triggered when the door reaches fully opened or closed states
  (magnetic reed-switches is useful for this).  
  If only one or no sensors are defined, a timeout-trigger will be used instead based on `maxTransitionTime`.
* `canBeStopped` configures whether the door can be stopped mid transition. If it does, it's assumed triggering the switch will stop the door and another triggering will make the door reverse direction.
