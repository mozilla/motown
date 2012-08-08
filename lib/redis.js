/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const config = require('./configuration').get('redis');

var redis = require('redis');

function createClient(){
  redisClient = redis.createClient(config.port, config.host);

  redisClient.debug_mode = false;

  // This is most-likely set by VCAP_SERVICES if it is set.
  if (typeof(config.password) == 'string'){
    redisClient.auth(config.password);
  }
  return redisClient;
}

module.exports = {
  io: createClient(),
  pub: createClient(),
  'new': createClient
}
