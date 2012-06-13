/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

function normalizeIrcName(name){
  if (name.indexOf('@') == 0) {
    return name.slice(1);
  }
  return name;
}

module.exports = {
  parseNick: function(nick){
    var split = nick.split('|', 2);

    return {'nick': split[0], 'status': split[1]};
  },
  normalizeIrcName: normalizeIrcName,
  normalizeChannels: function(channels){
    var networks = [];
    for(var i in channels){
      networks.push(normalizeIrcName(channels[i]));
    }
    return networks;
  }
}