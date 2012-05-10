/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var 
logger = require('winston'),
FeedMe = require('feedme');

exports.FeedParser = function(callback){
  this.parser = new FeedMe();
  this.parser.on('item', function(item){
    //We discard things that are older than an hour
    if (new Date() - Date.parse(item.updated) < (1).hour()){
      callback({
        id: item.id,
        description: item.title,
        people: [item.author],
        href: item.link.href,
        published: item.updated,
        'media:thumbnail': item['media:thumbnail']
      });
    }
  });

  this.feed = function(chunk){
    this.parser.write(chunk);
  };
};