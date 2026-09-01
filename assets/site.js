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
  var toggle = document.getElementById('diagramToggle');

  function setPlaying(playing){
    diagram.classList.toggle('animate', playing);
    if(!toggle) return;
    // The label IS the accessible name and it changes with state, so
    // aria-pressed would double-announce. Name-only is the clearer pattern
    // for play/pause.
    toggle.textContent = playing ? 'Pause' : 'Play';
    toggle.setAttribute('aria-label', playing
      ? 'Pause the row-level security query animation'
      : 'Play the row-level security query animation');
  }

  if(diagram){
    // The loop runs indefinitely, so it always needs a way to stop it.
    if(toggle){
      toggle.addEventListener('click', function(){
        setPlaying(!diagram.classList.contains('animate'));
      });
    }

    // Sync the control to reality before anything starts it — otherwise the
    // button reads "Pause" while the diagram sits still, until the observer
    // happens to fire.
    setPlaying(false);

    if(reduceMotion){
      // Respect the preference, but leave the control as an opt-in.
      diagram.classList.add('static-state');
    } else if('IntersectionObserver' in window){
      var dio = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){
            setPlaying(true);
            dio.unobserve(entry.target);
          }
        });
      }, { threshold: 0.3 });
      dio.observe(diagram);
    } else {
      setPlaying(true);
    }
  }
})();
