/*!

 ----------------------------------------------------------------------------
 | ewd-client: Browser (websocket & HTTP) Client for QEWD applications       |
 |                                                                           |
 | Copyright (c) 2016-17 M/Gateway Developments Ltd,                         |
 | Reigate, Surrey UK.                                                       |
 | All rights reserved.                                                      |
 |                                                                           |
 | http://www.mgateway.com                                                   |
 | Email: rtweed@mgateway.com                                                |
 |                                                                           |
 |                                                                           |
 | Licensed under the Apache License, Version 2.0 (the "License");           |
 | you may not use this file except in compliance with the License.          |
 | You may obtain a copy of the License at                                   |
 |                                                                           |
 |     http://www.apache.org/licenses/LICENSE-2.0                            |
 |                                                                           |
 | Unless required by applicable law or agreed to in writing, software       |
 | distributed under the License is distributed on an "AS IS" BASIS,         |
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  |
 | See the License for the specific language governing permissions and       |
 |  limitations under the License.                                           |
 ----------------------------------------------------------------------------

 25 January 2017

  Thanks to Ward DeBacker for enhancements to the client functionality

 */

var EWD;

(function() {
  var events = {};

  var emitter = {
    on: function(type, callback, deleteWhenFinished) {
      if (!events[type]) events[type] = [];
      events[type].push({
        callback: callback,
        deleteWhenFinished: deleteWhenFinished
      });
    },
    off: function(type, callback) {
      var event = events[type];
      if (typeof callback === 'function') {
        if (event) {
          for (var i = 0; i < event.length; i++) {
            if (event[i].callback === callback) {
              event.splice(i,1);
            }
          }
        }
      }
      else {
        event = [];
      }
    },
    emit: function(type, data) {
      var ev = events[type];
      if (!ev || ev.length < 1) return;
      data = data || {};
      for (var i = 0; i < ev.length; i++) {
        var e = ev[i];
        e.callback(data);
        if (e.deleteWhenFinished && data.finished) ev.splice(i,1);
      }
    }
  };

  var start = function(application, $, io, customAjaxFn, url) {

    //console.log('starting ewd-client: ' + JSON.stringify(application));

    var url;
    var cookieName = 'ewdSession';
    var appName = application;
    if (typeof application === 'object') {
      $ = application.$;
      io = application.io;
      customAjaxFn = application.ajax;
      url = application.url;
      appName = application.application;
      cookieName = application.cookieName;
    }

    function getCookie(name) {
      var value = "; " + document.cookie;
      var parts = value.split("; " + name + "=");
      if (parts.length == 2) return parts.pop().split(";").shift();
    }

    (function(application, io, customAjaxFn, url) {

      //console.log('application = ' + application);
      //console.log('customAjaxFn = ' + typeof customAjaxFn);

      var token;
    
      EWD.application = application;

      function registerEvent(messageObj, callback) {
        var cb = callback;
        var type = messageObj.type;
        if (type === 'ewd-fragment') {
          type = type + ':' + messageObj.params.file;
          var targetId = messageObj.params.targetId;
          var fragmentName = messageObj.params.file;
          cb = function(responseObj) {
            if (typeof $ !== 'undefined') $('#' + targetId).html(responseObj.message.content);
            callback(fragmentName);
          }
          delete messageObj.params.targetId;
        }
        EWD.on(type, cb, true);
      }

      function handleResponse(messageObj) {
        // messages received back from Node.js

        //if (EWD.log && messageObj.type !== 'ewd-register') console.log('raw received: ' + JSON.stringify(messageObj));
        if (messageObj.message && messageObj.message.error && messageObj.message.disconnect) {
          if (typeof socket !== 'undefined') {
            socket.disconnect();
            console.log('Socket disconnected');
          }
          EWD.send = function() {};
          EWD.emit = function() {};
          console.log(messageObj.message.error);
          return;
        }
        if (messageObj.type === 'ewd-register') {
          token = messageObj.message.token;

          EWD.setCookie = function(name) {
            name = name || 'ewd-token';
            document.cookie = name + "=" + token;
          };

          console.log(application + ' registered');
          EWD.emit('ewd-registered');
          return;
        }
        if (messageObj.type === 'ewd-reregister') {
          console.log('Re-registered');
          EWD.emit('ewd-reregistered');
          return;
        }
        if (EWD.log) console.log('received: ' + JSON.stringify(messageObj));

        if (messageObj.type === 'ewd-fragment') {
           if (messageObj.message.error) {
             EWD.emit('error', messageObj);
             return;
           }
           EWD.emit('ewd-fragment:' + messageObj.message.fragmentName, messageObj);
           return;
        }

        if (messageObj.message && messageObj.message.error) {
          var ok = EWD.emit('error', messageObj);
          if (ok) return;
        }

        EWD.emit(messageObj.type, messageObj);
      };

      function ajax(messageObj, callback) {
          if (callback) {
            registerEvent(messageObj, callback);
          }
          if (token) {
            messageObj.token = token;
          }
          if (token || messageObj.type === 'ewd-register') {
            messageObj.token = token;
            console.log('Ajax send: ' + JSON.stringify(messageObj));
            (function(type) {

              function success(data) {
                console.log('Ajax response for type ' + type + ': ' + JSON.stringify(data));
                if (data.ewd_response !== false) {
                  handleResponse({
                    type: type,
                    message: data,
                    finished: true
                  });
                }
              }

              function fail(error) {
                console.log('Error occurred: ' + error);
                var messageObj = {
                  message: {error: error}
                };
                EWD.emit('error', messageObj);
              }

              var params = {
                //url: '/ajax',
                url: (url ? url : '') + '/ajax',
                type: 'post',
                contentType: 'application/json',
                data: messageObj,
                dataType: 'json',
                timeout: 10000
              };

              if (customAjaxFn) {
                customAjaxFn(params, success, fail);
              }
              else if (typeof $ !== 'undefined') {
                $.ajax({
                  url: params.url,
                  type: params.type,
                  contentType: params.contentType,
                  data: JSON.stringify(params.data),
                  dataType: params.dataType,
                  timeout: params.timeout
                })
                .done(function(data) {
                  success(data);
                })
                .error(function(err) {
                  var error = err.responseJSON.error;
                  fail(error);
                });
              }
              else {
                console.log('Error: No Ajax handler function is available');
              }
            }(messageObj.type));
            delete messageObj.token;
            if (EWD.log) console.log('sent: ' + JSON.stringify(messageObj));
          }
      };

      EWD.send = function(messageObj, callback) {
        if (messageObj.ajax) {
          ajax(messageObj, callback);
          return;
        }
        if (callback) {
          registerEvent(messageObj, callback);
        }
        if (token) {
          messageObj.token = token;
          socket.emit('ewdjs', messageObj);
          delete messageObj.token;
          if (EWD.log) console.log('sent: ' + JSON.stringify(messageObj));
        }
      };

      EWD.getFragment = function(params, callback) {
        EWD.send({
          type: 'ewd-fragment',
          service: params.service || false,
          params: {
            file: params.name,
            targetId: params.targetId
          }
        }, callback);
      };

      if (io) {
        var socket;
        if (url) {
          socket = io(url, {
            transports: ['websocket'] // needed for react-native
          });
        }
        else {
          socket = io.connect();
        }
        socket.on('connect', function() {

          EWD.disconnectSocket = function() {
            socket.disconnect();
            console.log('EWD disconnected socket');
          };

          //console.log('token: ' + token + '; ' + cookieName + ' cookie: ' + getCookie(cookieName)); 

          if (!token && cookieName && getCookie(cookieName)) token = getCookie(cookieName);

          if (token) {
            // re-connection occured - re-register to attach to original Session
            var message = {
              type: 'ewd-reregister',
              token: token
            };
          }
          else {
            var message = {
              type: 'ewd-register',
              application: application
            };
          }
          socket.emit('ewdjs', message);
        }); 

        socket.on('ewdjs', handleResponse);

        socket.on('disconnect', function() {
          console.log('*** server has disconnected socket, probably because it shut down');
          EWD.emit('socketDisconnected');
        });

      }
      else {
        EWD.send = ajax;
        EWD.send({
          type: 'ewd-register',
          application: application
        });
      }

    })(appName, io, customAjaxFn, url);

    EWD.start = function() {};
    io = null;
    customAjaxFn = null;
  }

  var ewd = function() {
    this.application = 'undefined';
    this.log = false;
  };

  var proto = ewd.prototype;
  proto.on = emitter.on;
  proto.off = emitter.off;
  proto.emit = emitter.emit;
  proto.start = start;

  EWD = new ewd();
})();

if (typeof module !== 'undefined') module.exports = EWD;
