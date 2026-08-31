/* Scaffold — shared behaviour: scroll reveals + optional RLS diagram animation */
(function(){
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var revealEls = document.querySelectorAll('.reveal, .reveal-stagger');
  if('IntersectionObserver' in window && !reduceMotion){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function(el){ io.observe(el); });
  } else {
    revealEls.forEach(function(el){ el.classList.add('in-view'); });
  }

  // Only present on the Keystone product page.
  var diagram = document.getElementById('rlsDiagram');
  if(diagram){
    if(reduceMotion){
      diagram.classList.add('static-state');
    } else if('IntersectionObserver' in window){
      var dio = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){
            diagram.classList.add('animate');
            dio.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      dio.observe(diagram);
    } else {
      diagram.classList.add('animate');
    }
  }
})();
