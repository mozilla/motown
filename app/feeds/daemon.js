#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

require('../../lib/extensions/number');
 
var
maxStoryAge = (12).hours(),
logger  = require('../../lib/logger'),
config  = require('../../lib/configuration'),
deduper = new (require('./deduper'))(maxStoryAge),
FeedParser = require('feedparser'),
mysql   = require('mysql').createClient(config.get('mysql')),
redis   = require('../../lib/redis')();

var subscriptions = {}; // {<url>: [<user.id>, ...], ...
var timers = {};

function schedule(url, delay){
  if (!delay)
    delay = (30).seconds();

  timers[url] = setTimeout(function(){scrape(url)}, delay);
}

function scrape(url){
  delete timers[url];

  logger.debug("Scraping: " + url + " for users: " + JSON.stringify(subscriptions[url]));

  var parser = new FeedParser();

  //HACKHACK: Overwriting the parser's error handler
  parser.handleError = function(e, scope){
    logger.debug("Got an error parsing feed in feed daemon: " + e);
    schedule(url);
  }

  parser.parseUrl(url, function(err, meta, articles){
    if (err){
      logger.error("Error parsing URL: " + url + "\n\t" + err);
    }
    else{
      for (var i in articles){

        var story = {
          id: articles[i].guid,
          people: articles[i].author,
          title: articles[i].title,
          href: articles[i].link,
          pubdate: articles[i].pubdate,
          image: articles[i].image
        };

        
        if (((new Date() - Date.parse(story.pubdate) < maxStoryAge) && deduper.hasntHeardOf(story.id))) {
          deduper.add(story.id);
          redis.lpush("serializer:stories", JSON.stringify({'userIds': subscriptions[url], 'story': story}), function (err, reply) {
            if (err)
              logger.error(err);
          });
        }
      }
    }
    schedule(url);
  });
}

function reloadUrls(){
  for (var url in timers){
    clearTimeout(timers[url]);
  }
  timers = {};
  subscriptions = {};

  mysql.query(
    "SELECT url, user_id as userId FROM feeds WHERE verified = 1 ORDER BY url, user_id",
    function(err, rows){

      if (!err){
        var url = null;
        for (var i in rows){
          if (rows[i].url != url){
            url = rows[i].url;
            subscriptions[url] = [rows[i].userId];
          }
          else{
            subscriptions[url].push(rows[i].userId);
          }
        }
        for (var url in subscriptions){
          scrape(url)
        }
      }
      else{
        logger.error("Error initializing RSS Scraper: " + err + "\n\nExiting.");
        process.exit(1);
      }
    }
  );
}

var reloadInterval = setInterval(reloadUrls, (10).minutes());
reloadUrls();

// TODO: listen as a worker.
