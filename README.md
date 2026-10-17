# RiffRaff phone controller

Open https://colemanimation.github.io/riffraff-play/ and enter the code shown by the Hearth RiffRaff alpha. Keep Hearth open.

This is the actual alpha controller, not the earlier design mockup. It connects to Hearth through PeerJS/WebRTC; prompts, private answers, votes and scores remain owned by the room service running on the host computer. The host runs the separate Hearth alpha development launcher; stable Hearth 0.7.1 does not include this bridge. Networks that block direct WebRTC may require a TURN relay. Physical phone and separate-network acceptance are pending.

Original RiffRaff art. PeerJS is MIT licensed; see vendor/PeerJS-LICENSE.txt. No Quiplash assets, host credentials, prompt banks or private project files are published here.
