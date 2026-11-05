(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.MomoBrowserTarget=api;})(globalThis,()=>{
  'use strict';
  function detect(ua){
    const value=typeof ua==='string'?ua:'';
    const match=/Chrome\/([\d.]+)/.exec(value);
    const other=/Edg(?:e|A|iOS)?\/|OPR\/|Opera\/|Vivaldi\/|SamsungBrowser\//.test(value);
    const chrome=!!match&&!other;
    return {windows:/Windows NT/.test(value),chrome,browser:chrome?'Chrome':'other',version:chrome?match[1]:null};
  }
  return {detect};
});
