/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */


$(function(){
  $("#browserid").click(function(){
    navigator.id.getVerifiedEmail(function(assertion) {
      if (assertion) {
        $("input").val(assertion);
        $("form").submit();
      } else {
        location.reload();
      }
    });    
  });

  // Add a class to body tag for css rules
  var controller = $.grep(document.location.pathname.split("\/"), function(n){
      return(n);
  })[0];

  $('body').addClass(controller);
  $('ul.nav li.' + controller).addClass('active');

  if (typeof($(".chzn-select").chosen) == 'function'){
    $(".chzn-select").chosen();
  }

  // Page-specific stuff:
  switch(document.location.pathname){
    case '/profile':

      $('#user_form').submit(function(){
        saveUser();
        return false;
      });

      var updateLastSaved = function(){

        $('#changes_saved .timestamp').text($.format.date(new Date(), 'hh:mm:ssa'));
        $('#changes_saved').show();
        setTimeout(function(){
          $('#changes_saved').fadeOut();
        }, 2000);
      };

      var saveUser = function(){
        $.ajax({
          url: '/profile',
          type: 'PUT',
          data: $('#user_form').serialize(),
          success: updateLastSaved
        });
      };

      var postNick = function(){
        if ($('#source_from_irc').is(':checked')){
          $('#user_real_name').attr('placeholder', 'Loading from irc.mozilla.org');
        }
        $.ajax({
          url: "/profile/nick", 
          data: $("#user_form").serialize(), 
          success: function(data){
            $('#error_contacting_nickserv').hide();

            var changeRealName = ($('#user_real_name').val().length == 0);

            $('#user_real_name').attr('placeholder', 'Real Name');

            if (changeRealName){
              $('#user_real_name').val(data['realName']);
            }

            var ul = $('#channels');
            ul.empty();
            for(var i in data.networks){
              var network = data.networks[i];
              var option = $("#autojoin_channels option[value=" + network + "]");

              if (option.length > 0){
                option.attr('selected', 'selected');
              }
              else{
                // HACKHACK: This shouldn't be required, but it seems that the full list isn't properly returning from the IRC client...
                $("#autojoin_channels").append($("<option selected=\"selected\" value=\"" + network + "\">" + network + "</option>"));
              }
              ul.append("<li>" + network  + "</li>");
            }

            $('.chzn-select').trigger("liszt:updated");

            $('#channels').show();
          },
          error: function(err){
            $('#error_contacting_nickserv').show();
            console.log(err);
            console.log("error contacting nickserv");
          },
          type: 'POST'
        });

        return false;
      };

      var nick = $('#user_nick');
      nick.change(postNick);

      if (nick.val().length > 0){
        postNick();
      }

      $('#user_real_name').change(saveUser);
        
      $('.feeds #new_feed_form').click(function(){
        createBlankFeedForm();
        return false;
      });

      function deleteUrl(){
        var form = $(this).parent();

        if (!form.hasClass('verified') && !form.hasClass('error')){
          // This hasn't been serialized yet.
          form.parent().remove();
        }
        $.ajax({
          type: 'DELETE',
          url: '/feeds/feed',
          data: form.serialize(),
          success: function(){
            form.parent().remove();
          },
          error: function(){
            console.log("Error removing");
          }
        });
        return false;
      }

      $('.feeds form .delete').click(deleteUrl);

      function validateAndSaveUrl(){
        var form = $(this).parent();

        form
          .removeClass('verified')
          .removeClass('error')
          .find('.delete').hide();
        
        var reqData = form.serialize();

        form.find('input[type=hidden]').val($(this).val());

        $.ajax({
          type: 'POST',
          url: '/feeds/feed',
          data: reqData,
          success: function(data){
            if (data.url == ""){
              form.remove();
            }
            if (data.verified){
              form.addClass('verified');
              if($('input[name=url][value=]').length == 0){
                createBlankFeedForm();
              }
            }
            else{
              form.addClass('error');
            }
            form.find('.delete').show();
            form.find('input[type=text]').attr('title', data.title);
          },
          error: function(){
            //TODO: Do something intelligent in the UI.
            console.log("Error persisting element");
          }
        });
      }

      $('.feeds form input[name=url]').change(validateAndSaveUrl);

      var feedTemplate = $('#feed_template');
      feedTemplate.removeAttr('id').remove();

      function createBlankFeedForm(){
        var blankInput = $('.feeds input[type=text][value=]');

        if (blankInput.length > 0){
          blankInput.focus();
          return;
        }
        var newFeed = feedTemplate.clone();
        newFeed.find('input[name=url]').change(validateAndSaveUrl);
        newFeed.find('.delete').click(deleteUrl);
        newFeed.find('form').submit(function(){
          return false;
        });
        $('ul.feeds').append(newFeed);
        newFeed.show();
        $(newFeed).focus();
      }

      createBlankFeedForm();

      function validateAndSaveTokens(){
        $('.mentionTokens li').removeClass('error');
        var inputs = $('.mentionTokens li input[type=text]');
        var tokens = [];
        for (var i=0; i<inputs.length; i++){
          if($(inputs[i]).val().match(/^\w[\w\-\_]+$/)){
            tokens.push($(inputs[i]).val());
          }
          else{
            $(inputs[i]).parent().parent().addClass('error');
            return false;
          }
        }

        tokens;
        $.ajax({
          url: '/profile/watchedTokens',
          type: 'PUT',
          data: {tokens: tokens},
          success: updateLastSaved,
          error: console.log
        });
        
      }

      $('#mentions #new_token_input').click(function(){
        createBlankTokenItem();
        return false;
      });


      function deleteToken(){
        $(this).parent().remove();
        validateAndSaveTokens();
        return false;
      }

      var tokenTemplate = $('#mention_token_template');
      tokenTemplate.removeAttr('id').remove();

      $('#mentions form').submit(function(){return false;})

      function createBlankTokenItem(){
        var blankInput = $('.mentionTokens input[type=text][value=]');
        if (blankInput.length > 0){
          blankInput.focus();
          return;
        }

        var newTokenInput = tokenTemplate.clone();
        newTokenInput.find('input').change(validateAndSaveTokens);
        newTokenInput.find('.delete').click(deleteToken);
        $('ul.mentionTokens').append(newTokenInput);
        newTokenInput.show();
        newTokenInput.focus();
      }

      $('ul.mentionTokens .delete').click(deleteToken);
      $('ul.mentionTokens input[type=text]').change(validateAndSaveTokens);

      break;
  }
  
});