/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */


var 
logger = require('winston'),
sha1 = require('sha1');

require('../../lib/extensions/number');


// TODO:  "value", This should be backed by a linked-list in redis, mysql or some 
//		    method that doesn't just exist in memory. A bloom filter could be 
//        nice.

// TODO: This could use some tests

module.exports = function(){
  this.keys = {};

  this.hasntHeardOf = function(key){
    return (!(key in this.keys));
  }
  this.add = function(key){
    if (!(key in this.keys))
      this.keys[key] = new Date();

    return;
  }
  this.prune = function(){
    logger.debug('Pruning!');
    for (var key in this.keys){
      //TODO: Go back to 1 hour
      if (new Date() - this.keys[key] > (30).hour()){
        logger.debug('Removing key: ' + key);
        delete this.keys[key];
      }
    }
  }
  var that = this;
  setInterval(function(){that.prune()}, (10).minutes());
};
