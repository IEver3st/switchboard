# Third-party notices

## nnnoiseless / RNNoise fallback

Switchboard's packaged noise-suppression fallback uses `nnnoiseless` v0.5.2,
a Rust port of Xiph.Org's RNNoise, pinned to commit
`924a2dd143ccad7bce9e5bda061b60ca32911a67`.

Copyright (c) 2020, Joe Neeman  
Copyright (c) 2017, Mozilla  
Copyright (c) 2007-2017, Jean-Marc Valin  
Copyright (c) 2005-2017, Xiph.Org Foundation  
Copyright (c) 2003-2004, Mark Borgerding

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice,
  this list of conditions and the following disclaimer.
- Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.
- Neither the name of the Xiph.Org Foundation nor the names of its contributors
  may be used to endorse or promote products derived from this software without
  specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## DeepFilterNet integration

Switchboard contains an optional integration for upstream DeepFilterNet
`libDF` v0.5.6, pinned to commit
`978576aa8400552a4ce9730838c635aa30db5e61`. Upstream code is dual-licensed
MIT or Apache-2.0. Switchboard does not redistribute the pretrained
DeepFilterNet3 weights because upstream has not explicitly resolved their
redistribution license. The integration only activates when a trusted local
model with the pinned hash has been deliberately acquired from the official
upstream source.
