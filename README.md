# 신혼여행 13일

여행 일정 앱(정적 페이지). 일정·예약·메모 데이터는 Supabase에 있고 로그인한 등록 계정만 불러올 수 있습니다. 이 저장소에는 개인 데이터가 없습니다.

- 배포: GitHub Pages (main 브랜치 루트) → https://opera0919-sketch.github.io/honeymoon/
- 파일: `index.html`, `app.css`, `app.js` (Leaflet·supabase-js는 CDN)
- 데이터 접근: `public.trip_*` RPC만 호출 (`wed_is_manager()` 확인)
