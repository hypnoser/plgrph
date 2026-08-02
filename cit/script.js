// ==========================================
  // 1. АВТОРИЗАЦІЯ (ЗАХИСТ ПАРОЛЕМ)
  // ==========================================
  var authOverlay = document.getElementById('auth-overlay');
  var mainAppContainer = document.getElementById('main-app-container');
  var passInput = document.getElementById('auth-password');
  var authBtn = document.getElementById('auth-submit-btn');
  var authError = document.getElementById('auth-error');

  var isAuthorized = false;
  try { isAuthorized = localStorage.getItem('cit_auth_passed') === 'true'; } catch(e) {}

  var unlockApp = function(saveToLocal) {
    if(authOverlay) authOverlay.style.display = 'none';
    if(mainAppContainer) mainAppContainer.style.display = 'block';
    if (saveToLocal) {
      try { localStorage.setItem('cit_auth_passed', 'true'); } catch(e) {}
    }
    initApp();
  };

  if (isAuthorized) {
    unlockApp(false);
  } else {
    var checkPassword = function() {
      // Очищаємо від пробілів та переводимо в нижній регістр
      var val = passInput.value.trim().toLowerCase();
      
      // Приймаємо plgrph або українську розкладку (здікзр)
      if (val === 'plgrph' || val === 'здікзр') {
        unlockApp(true);
      } else {
        if(authError) authError.style.display = 'block';
        if(authOverlay) {
          var modal = authOverlay.querySelector('.auth-modal');
          if(modal) {
            modal.style.animation = 'none';
            setTimeout(function() { modal.style.animation = 'shake 0.4s'; }, 10);
          }
        }
      }
    };
    
    if(authBtn) authBtn.addEventListener('click', checkPassword);
    if(passInput) passInput.addEventListener('keydown', function(e) { 
      if (e.key === 'Enter') checkPassword(); 
    });
  }
