# hyperspace

Simple dimensional analysis and unit conversion library designed for basing games in physical units.

## Install

```sh
pnpm install @r47onfire/hyperspace
```

## Quick start

```ts
import { UnitSystem, basicUnits, physicsUnits, dataUnits } from "@r47onfire/hyperspace";

const U = new UnitSystem();
basicUnits(U);      // installs basic length, time, mass, temperature
physicsUnits(U);   // installs newtons, pascals, joules, watts, etc.
dataUnits(U);      // installs bytes, kilobytes, megabytes, etc.

// Convert units numerically
const v = U.parse(100, "km/h");
U.convert(v, "m/s") // => 27.777777...

// Format as a string
U.format(v, "m/s") // => "27.777777... meters seconds^-1"
U.format(v, "m/s", false) // => "27.777777... m/s"

// Format as compound unit
U.format(U.parse(3661, "s"), ["h", "min", "s"])
// => "1 hour 1 minute 1 second"

// Format as best unit
U.format(U.parse(214523, "B"), ["B", "KB", "MB"], true)
// => "214.523 KB"

// Unit recognition
U.parse(5, "kg*m/s^2").kind // => "force" (equivalent to newtons)
```

## Define units

```ts
// base dimension kind name
U.addKind("length");
// derived dimension kind with composition exponents
U.addKind("speed", { length: 1, time -1 });

// base unit: name, abbreviation, kind, aliases
U.addBase("meters", "m", "length", ["metres"]);

// converted unit: name, abbreviation, conversion factor, reference unit
U.addConversion("centimeters", "cm", 100, "m", ["centimetres"]);
// unit = base * perBase

// non-affine unit: 2 numbers are ratio and offset
U.addOffsetConversion("celsius", "°C", 1, -273.15, "kelvin", ["℃"]);
U.addOffsetConversion("fahrenheit", "°F", 1.8, 32, "celsius", ["℉"]);
// unit = base * perBase + zeroOffset
```

## Math with units

```ts
U.parseUnit("N*m") // => the entry for Joules

U.add(a, b), U.sub(a, b), // must be the same dimensions, error if not
U.mul(a, b), U.div(a, b), // can be different dimensions
U.pow(a, n) // n must be a dimensionless number
```

## Metadata

```ts
U.kinds                 // => ["length", "time", ...]
U.dimensionsOf("force") // => { mass: 1, length: 1, time: -2 }
U.baseFor("length")     // => "meters"
U.expand("velocity")    // => { length: 1, time: -1 }
```

## Built-in units

Provided by `basicUnits()`:

* meters, centimeters, kilometers, feet, inches (length)
* pixels as configurable ratio length unit (default 64 pixels per meter)
* seconds milliseconds, minutes, hours (time)
* hertz (frequency = 1/time)
* kilograms, grams (mass)
* celsius, fahrenheit, kelvin (temperature)
* names "area", "volume", "velocity", "acceleration" (for length^2, length^3, length/time, and length/time^2)

Provided by `physicsUnits()`:

* amperes (current)
* newtons (force = mass*acceleration)
* pascals (pressure = force/area)
* joules (energy = force*length)
* watts (power = energy/time)
* coulombs (charge = current*time)
* volts (voltage = energy/charge)
* ohms (resistance = voltage/current)
* farads (capacitance = charge/voltage)
* webers (magnetic flux = voltage*time)
* henries (inductance = flux/current)
* teslas (magnetic field density = flux/area)

Provided by `dataUnits()`:

* bits, bytes (data)
* kilobytes, megabytes, gigabytes, terabytes (factor of 1000 scaling)
* kibibytes, mebibytes, gibibytes, tebibytes (factor of 1024 scaling)
* name "bitrate" for data/time

## Caveats

* No support for differentiating between normal frequency and angular frequency. For example:

    ```ts
    const L = U.parse(0.001, "henries")
    const C = U.parse(0.001, "farads");
    // resonant angular frequency = 1/sqrt(L*C) = 1000 rad/s
    const omega0 = U.pow(U.mul(L, C), -0.5);
    U.format(omega0, "Hz") // => "1000 Hz" - should error!!
    ```

* No support for logarithmic units (e.g. decibels) yet.
