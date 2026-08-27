
        // ============ تطبيق الوضع الليلي فورًا قبل أي رسم — يمنع "ومضة" الوضع الفاتح عند فتح التطبيق ============
        (function(){
            try {
                var raw = localStorage.getItem('poultry_state_v3');
                if (raw && JSON.parse(raw).darkMode) document.documentElement.setAttribute('data-theme', 'dark');
            } catch(e) {}
        })();
    