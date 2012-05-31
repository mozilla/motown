/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */


var 
logger = require('../../lib/logger'),
crypto = require('crypto');



require('../../lib/extensions/number');


// TODO:  "value", This should be backed by a linked-list in redis, mysql or some 
//		    method that isn't volatile  doesn't just exist in memory. A bloom filter could be 
//        nice.

// TODO: This could use some tests

module.exports = function(ageWindow){
  this.keys = {};

  this.hasntHeardOf = function(key){
    return (!(key in this.keys));
  }
  this.add = function(key){
    key = crypto.createHash('md5').update(key).digest();
    if (!(key in this.keys))
      this.keys[key] = new Date();

    return;
  }
  this.prune = function(){
    logger.debug('Pruning!');
    for (var key in this.keys){
      //TODO: Go back to 1 hour
      if (new Date() - this.keys[key] > ageWindow){
        logger.debug('Removing key: ' + key);
        delete this.keys[key];
      }
    }
  }
  var that = this;
  setInterval(function(){that.prune()}, (10).minutes());
};
