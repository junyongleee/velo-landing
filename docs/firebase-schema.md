# V.E.L.O. Firebase 백엔드 설계

이 설계는 Vercel Serverless API가 Firebase Admin SDK로 Firestore와 Storage에 접근하는 구조입니다. 브라우저는 Firebase에 직접 접근하지 않으므로 Firestore/Storage Rules는 기본적으로 전체 차단합니다.

## 운영 컬렉션

### `users`

방문자 단위의 기준 엔티티입니다. 총 유입 사용자 수는 이 컬렉션의 문서 수로 계산합니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | 문서 ID와 동일 |
| `authProvider` | string | 현재는 `signed_cookie` |
| `createdAt` | timestamp | 최초 방문 시각 |
| `lastSeenAt` | timestamp | 마지막 확인 시각 |

정규화 기준: 사용자 속성은 사용자 키에만 종속됩니다.

### `posts`

팬존 게시글 본문입니다. 카테고리는 `categoryId`로만 저장하고 표시명은 코드의 기준 테이블에서 해석합니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `title` | string | 제목 |
| `body` | string | 본문 |
| `categoryId` | string | `free`, `review`, `fanart`, `theory`, `test` |
| `authorName` | string | 표시용 작성자명 |
| `ownerUserId` | string | `users.userId` 참조 |
| `imageUrl` | string | Storage 다운로드 URL |
| `imageStoragePath` | string | Storage 객체 경로 |
| `imageOriginalName` | string | 원본 파일명 |
| `isDeleted` | boolean | 소프트 삭제 여부 |
| `createdAt` | timestamp | 작성 시각 |
| `updatedAt` | timestamp | 수정 시각 |
| `deletedAt` | timestamp | 삭제 시각 |

정규화 기준: 게시글 속성은 게시글 ID에 종속되고, 작성자 식별자는 사용자 테이블을 참조합니다.

### `story_unlocks`

사용자별 스토리 해금 상태입니다. 문서 ID는 `{userId}_{episodeNumber}`입니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | `users.userId` 참조 |
| `episodeNumber` | number | 해금 화수 |
| `unlockReason` | string | 현재는 `review_post` |
| `sourcePostId` | string | 해금에 기여한 게시글 |
| `createdAt` | timestamp | 해금 시각 |

정규화 기준: 후보키 `(userId, episodeNumber)`가 해금 사실을 결정합니다.

### `user_member_reactions`

사용자별 캐릭터 선호 상태입니다. 문서 ID는 `{userId}_{memberId}_favorite`입니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | `users.userId` 참조 |
| `memberId` | string | `ria`, `seoyun`, `mina`, `hana`, `jiwu` |
| `reactionType` | string | 현재는 `favorite` |
| `active` | boolean | 현재 좋아요 여부 |
| `createdAt` | timestamp | 최초 반응 시각 |
| `updatedAt` | timestamp | 마지막 변경 시각 |

정규화 기준: 후보키 `(userId, memberId, reactionType)`가 현재 반응 상태를 결정합니다.

### `user_events`

분석용 이벤트 로그입니다. 사용자가 어떤 화면을 봤는지, 어떤 글을 작성했는지, 어떤 캐릭터를 좋아했는지 시간순으로 추적합니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | `users.userId` 참조 |
| `eventType` | string | `page_view`, `post_created`, `member_favorited` 등 |
| `entityType` | string | `page`, `post`, `member` 등 |
| `entityId` | string | 대상 ID |
| `properties` | map | 부가 정보 |
| `createdAt` | timestamp | 발생 시각 |

정규화 기준: 원천 이벤트를 append-only로 저장하고, 집계값은 별도 파생 데이터로만 다룹니다.

## 정규화 메모

- 운영 데이터는 중복 표시명을 최소화하고 ID 참조를 사용합니다.
- 게시글 카테고리와 캐릭터 목록은 작은 기준 데이터라 코드/문서 기준 테이블로 관리합니다.
- 빠른 대시보드가 필요해지면 `daily_metrics` 같은 집계 컬렉션을 추가할 수 있지만, 이는 원천 데이터가 아닌 파생 데이터로 취급합니다.
- Firestore는 조인을 직접 제공하지 않으므로 API 계층에서 필요한 표시명을 조합합니다.

## 필요한 Vercel 환경변수

`firebase-env.example` 값을 Vercel Project Settings → Environment Variables에 등록합니다.

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `VELO_SESSION_SECRET`

## 보안 원칙

- 브라우저는 Firestore/Storage에 직접 접근하지 않습니다.
- Firestore Rules와 Storage Rules는 전체 차단으로 둡니다.
- 모든 쓰기 권한은 Vercel API에서 signed cookie 사용자와 `ownerUserId`를 비교해 검사합니다.
- 이미지 업로드는 API에서 5MB 이하의 이미지 MIME만 허용합니다.
