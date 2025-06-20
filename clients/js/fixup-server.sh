#!/bin/bash

cat >dist/src/cjs/package.json <<!EOF
{
    "type": "commonjs"
}
!EOF

cat >dist/src/esm/package.json <<!EOF
{
    "type": "module"
}
!EOF