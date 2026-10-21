# RiffRaff phone controller

Open https://colemanimation.github.io/riffraff-play/ and enter the code shown by RiffRaff in Hearth 0.8.0 or later. Keep Hearth and its game screen open.

This controller connects to Hearth through PeerJS/WebRTC; prompts, private answers, votes and scores remain owned by the room service running on the host computer. It retrieves a limited Metered relay credential at join time, providing UDP, TCP and TLS/443 routes when direct connections fail. The front-end key can retrieve only that one relay credential; it is not an account or administration key. The free account stops at 500 MB per month without charging. Only phone-controller traffic uses this allowance, not the main Hearth video share.

Direct connections remain available when the relay service cannot be reached. Relay responses are validated, loaded once per connection attempt and cached briefly. Join retries retain the original join identity, and connection errors remain visible alongside the unconfirmed-join message. Physical-phone and independent-network acceptance remain separate from local browser and real-relay checks.

Controller tests: `node --test tests/*.test.mjs`.

Compatible room services save private drafts while you type and use the latest received nonempty draft at the writing deadline. Submit still locks an answer. Incoming room updates preserve the native answer field so keyboard repeat, selection, and composition continue normally. Older room services retain local-only drafts.

Original RiffRaff art. PeerJS is MIT licensed; see vendor/PeerJS-LICENSE.txt. No Quiplash assets, host credentials, prompt banks or private project files are published here.
