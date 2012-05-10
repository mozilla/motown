#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
 
const
Url = require('url');

var
ee = new require('events').EventEmitter(),
http = require('https'),
logger = require('winston'),
parsers = require('./parsers'),
deduper = new (require('./deduper'))(),
redis = require('../../lib/redis');

require('../../lib/extensions/number');

var crawlList;
var crawlers = {};

function Crawler(url, users, parser){
  this.url = url;
  this.users = users;
  this.parserClass = parsers[parser];
  this.updateFrequency = 2000;
    
  this.crawl = function(){
    var httpOptions = Url.parse(this.url);
    var users = this.users;
    var parser = new this.parserClass(function(story){
      
      if (deduper.hasntHeardOf(story.id)){
        deduper.add(story.id);
        
        for (var user in users){
          var q = users[user] + ":stories";
          // LPUSH each story d -> [c,b,a] .. [d,c,b,a]
          redis.lpush(q, JSON.stringify(story), function (err, reply) {

            logger.debug("Added story to " + q);

            // LTRIM to 50 recent stories [d,c,b] (if it were 3)
            redis.ltrim(q, 0, 50, function (err, reply) {
              //TODO: Some logging maybe?
            });
          });
        }
      }
      
    });

    var crawler = this;

    http.get(httpOptions, function(response) {
      logger.debug("Crawl Response: " + response.statusCode + " (" + response + ")");
      response.on('data', function (chunk) {
        parser.feed(chunk);
      }).on('error', function(e) {
        logger.error("Error crawling (" + this.url + "): \n" + e.message);
        crawler.setTimeout();
      }).on('end', function(e) {
        logger.debug("Finalizing crawl (" + this.url + ")");
        // logger.debug(buffer.join(''));
        crawler.setTimeout();
      });
    });
  };

  this.setTimeout = function(){
    var that = this;
    this.timeout = setTimeout(function(){that.crawl()}, (30).seconds());
  };

  this.die = function(){
    clearTimeout(this.timeout);
  };

  this.crawl();  
}

function updateCrawlers(){
  logger.info('Updating crawlers.');
  //TODO: Actually get the URLs
  var tasks = [
    {
      url: 'https://github.com/simonwex.private.atom?token=XXX',
      users: ['simon@simonwex.com', 'swex@mozilla.com'],
      parser: 'FeedParser'
    }
  ];

  for (var i in crawlers){
    crawlers[i].die();
  }

  crawlers = {};

  for (i in tasks){
    var task = tasks[i];
    crawlers[task.url] = new Crawler(task.url, task.users, task.parser);
  }
}

updateCrawlers();
