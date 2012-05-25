/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var 
logger = require('winston'),
FeedMe = require('feedme');

require('../../lib/extensions/number');

const
WINDOW = (30).hour();

module.exports = {
  AtomParser: function(callback){
    this.parser = new FeedMe();
    this.parser.on('item', function(item){
      //We discard things that are older than an hour
      if (new Date() - Date.parse(item.updated) < WINDOW){
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
  },
  RssParser: function(callback){
    this.parser = new FeedMe();
    this.parser.on('item', function(item){
      //We discard things that are older than an hour
      if (new Date() - Date.parse(item.pubdate) < WINDOW){
        callback({
          id: item.guid.text,
          description: item.title,
          people: [{name: item['dc:creator']}],
          href: item.link,
          published: item.pubdate
        });
      }
    });

    this.feed = function(chunk){
      this.parser.write(chunk);
    };
  }
};